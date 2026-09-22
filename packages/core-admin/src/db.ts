/**
 * DB 접근 계층 — 드라이버 독립.
 *
 * 이식성이 이 프로젝트의 제1 요건이다(로컬 -> NAS -> 베트남 서버로 두 번 이전 예정).
 * 그래서 앱 코드는 아래 DbClient 인터페이스만 알고, 실제 드라이버는 DATABASE_URL이 결정한다.
 *
 *   postgresql://...   진짜 PostgreSQL (운영, Docker, NAS, 관리형 DB)
 *   pglite://<경로>     인프로세스 PostgreSQL (개발용, Docker 불필요)
 *
 * 드라이버가 바뀌어도 SQL은 그대로다. PGlite는 WASM으로 컴파일된 실제 PostgreSQL이기 때문이다.
 */

export type Row = Record<string, unknown>;

export interface QueryResult<T = Row> {
  rows: T[];
  rowCount: number;
}

/** 트랜잭션 안에서 쓰는 최소 인터페이스. pg.PoolClient와 PGlite 트랜잭션 둘 다 만족한다. */
export interface DbClient {
  query<T = Row>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

interface Driver extends DbClient {
  transaction<T>(fn: (c: DbClient) => Promise<T>): Promise<T>;
  /** 여러 문장으로 된 스크립트 실행 (마이그레이션·시드용) */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

let driver: Driver | null = null;

function connectionString(): string {
  return process.env.DATABASE_URL ?? 'pglite://.pgdata';
}

/** 진짜 PostgreSQL (pg 라이브러리) */
async function createPgDriver(url: string): Promise<Driver> {
  const { default: pg } = await import('pg');

  // int8(count 등)을 문자열이 아니라 숫자로 받는다.
  // numeric(금액)은 정밀도 손실을 막기 위해 문자열 그대로 둔다.
  pg.types.setTypeParser(20, (v: string | null) => (v === null ? null : Number(v)));

  // 날짜·시각은 Date 객체가 아니라 문자열로 받는다.
  // 서버 컴포넌트가 값을 그대로 렌더링하는데 Date 객체는 React가 렌더링하지 못하고,
  // 직렬화 과정에서 시간대가 밀려 날짜가 하루 어긋나는 사고도 흔하다.
  for (const oid of [1082, 1114, 1184]) {
    pg.types.setTypeParser(oid, (v: string | null) => v);
  }

  const pool = new pg.Pool({
    connectionString: url,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on('error', (err: Error) => console.error('[db] idle client error', err.message));

  return {
    async query<T>(text: string, params: unknown[] = []) {
      const res = await pool.query(text, params as never[]);
      return { rows: res.rows as T[], rowCount: res.rowCount ?? res.rows.length };
    },
    async transaction<T>(fn: (c: DbClient) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn({
          async query<R>(text: string, params: unknown[] = []) {
            const r = await client.query(text, params as never[]);
            return { rows: r.rows as R[], rowCount: r.rowCount ?? r.rows.length };
          },
        });
        await client.query('COMMIT');
        return out;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
    async exec(sql: string) {
      // pg는 단순 쿼리 프로토콜로 여러 문장을 한 번에 보낼 수 있다
      await pool.query(sql);
    },
    async close() {
      await pool.end();
    },
  };
}

/**
 * pglite:// 경로 해석.
 *
 * 실행 위치가 루트(스크립트)일 때와 apps/web(개발 서버)일 때가 다르다.
 * 파일시스템을 뒤져 루트를 찾는 방식은 번들러가 프로젝트 전체를 추적하게 만들어
 * 빌드를 망가뜨리므로, 경로는 환경변수로 명시하거나 실행 위치 기준으로만 푼다.
 *   apps/web/.env.local  -> pglite://../../.pgdata
 *   루트 .env.local       -> pglite://.pgdata
 */
async function resolvePgliteDir(raw: string): Promise<string> {
  const { resolve } = await import('node:path');
  return resolve(process.env.VSP_DATA_ROOT ?? process.cwd(), raw);
}

/** 인프로세스 PostgreSQL (PGlite). 개발용 — Docker도 별도 서버도 필요 없다. */
async function createPgliteDriver(url: string): Promise<Driver> {
  // 개발 전용(pglite://). 운영 빌드가 이 개발 의존성을 번들·해석하지 않도록 변수 지정자로 동적 import 한다.
  const pgliteSpecifier = '@electric-sql/pglite';
  const { PGlite } = await import(/* webpackIgnore: true */ /* @vite-ignore */ pgliteSpecifier);
  const dir = await resolvePgliteDir(url.replace(/^pglite:\/\//, '') || '.pgdata');
  // pg 드라이버와 동일하게 날짜·시각을 문자열로 유지한다.
  // 두 드라이버가 다른 타입을 돌려주면 개발과 운영에서 화면이 달라진다.
  const keepAsText = (v: string | null) => v;
  const db = new PGlite(dir, {
    parsers: { 1082: keepAsText, 1114: keepAsText, 1184: keepAsText },
  });
  await db.waitReady;

  return {
    async query<T>(text: string, params: unknown[] = []) {
      const res = await db.query(text, params as unknown[]);
      return { rows: res.rows as T[], rowCount: res.rows.length };
    },
    async transaction<T>(fn: (c: DbClient) => Promise<T>) {
      return db.transaction(async (tx: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }) => {
        return fn({
          async query<R>(text: string, params: unknown[] = []) {
            const r = await tx.query(text, params as unknown[]);
            return { rows: r.rows as R[], rowCount: r.rows.length };
          },
        });
      }) as Promise<T>;
    },
    async exec(sql: string) {
      // PGlite의 query()는 단일 문장만 받는다. 여러 문장은 exec()를 써야 한다.
      await db.exec(sql);
    },
    async close() {
      await db.close();
    },
  };
}

async function getDriver(): Promise<Driver> {
  if (!driver) {
    const url = connectionString();
    driver = url.startsWith('pglite://')
      ? await createPgliteDriver(url)
      : await createPgDriver(url);
  }
  return driver;
}

/** 단순 조회 */
export async function query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const d = await getDriver();
  const res = await d.query<T>(text, params);
  return res.rows;
}

/** 단건 조회 (없으면 null) */
export async function queryOne<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * 트랜잭션.
 * 결재 승인처럼 여러 테이블이 함께 바뀌는 작업은 반드시 이 안에서 처리한다.
 *
 * 주의: 블록 안에서는 전달받은 client만 쓸 것.
 * 전역 query()를 부르면 다른 커넥션에서 실행되어 트랜잭션 밖의 상태를 보게 된다.
 */
export async function tx<T>(fn: (c: DbClient) => Promise<T>): Promise<T> {
  const d = await getDriver();
  return d.transaction(fn);
}

/**
 * 여러 문장으로 된 SQL 스크립트 실행 (마이그레이션·시드).
 * 파라미터 바인딩은 지원하지 않으므로 사용자 입력을 절대 넣지 말 것.
 */
export async function execScript(sql: string): Promise<void> {
  const d = await getDriver();
  await d.exec(sql);
}

/** 앱 종료 시 정리 */
export async function closePool(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}
