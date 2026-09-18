/**
 * 시즌(회기) 관리.
 *
 * 경기인 등록은 연간 갱신제다 — 새 회기를 열고 "현재 시즌"으로 지정해야
 * 그 해의 등록·대회가 그 회기에 묶인다. 미팅 직후 실등록을 받으려면 현재 시즌이 열려 있어야 한다.
 * scope: GLOBAL(전국 공통, 기본), SPORT(종목별 회기)도 둘 수 있다.
 * "현재 시즌"은 범위(scope)마다 하나만 존재한다.
 */
import { query, queryOne, tx } from './db';
import { writeAudit } from './audit';
import type { UUID } from './types';
import type { I18nText } from './i18n';

export interface Season {
  id: UUID;
  code: string;
  name_i18n: I18nText;
  scope_type: string;
  scope_ref_id: UUID | null;
  starts_on: string;
  ends_on: string;
  is_current: boolean;
}

export async function listSeasons(): Promise<Season[]> {
  return query<Season>(
    `SELECT id, code, name_i18n, scope_type, scope_ref_id,
            starts_on::text, ends_on::text, is_current
       FROM core.season
      ORDER BY is_current DESC, starts_on DESC`
  );
}

/** 현재 시즌 (GLOBAL 기본). 등록·대회 생성 시 기본 회기로 쓴다. */
export async function getCurrentSeason(scopeRefId: UUID | null = null): Promise<Season | null> {
  return queryOne<Season>(
    `SELECT id, code, name_i18n, scope_type, scope_ref_id, starts_on::text, ends_on::text, is_current
       FROM core.season
      WHERE is_current
        AND (($1::uuid IS NULL AND scope_type = 'GLOBAL') OR scope_ref_id = $1)
      ORDER BY starts_on DESC LIMIT 1`,
    [scopeRefId]
  );
}

export interface SeasonInput {
  code: string;
  nameI18n: I18nText;
  startsOn: string;
  endsOn: string;
  scopeType?: string;         // GLOBAL | SPORT
  scopeRefId?: UUID | null;   // SPORT 일 때 sport.id
}

/** 새 회기 생성. 처음엔 현재로 지정하지 않는다(개시 시점에 담당자가 명시적으로 현재로 전환). */
export async function createSeason(
  input: SeasonInput,
  actor: { personId?: UUID | null } = {}
): Promise<Season> {
  return tx(async (client) => {
    const res = await client.query<Season>(
      `INSERT INTO core.season (code, name_i18n, scope_type, scope_ref_id, starts_on, ends_on, is_current)
       VALUES ($1, $2::jsonb, $3, $4, $5::date, $6::date, false)
       RETURNING id, code, name_i18n, scope_type, scope_ref_id, starts_on::text, ends_on::text, is_current`,
      [input.code.trim(), JSON.stringify(input.nameI18n), input.scopeType ?? 'GLOBAL',
       input.scopeRefId ?? null, input.startsOn, input.endsOn]
    );
    const s = res.rows[0];
    await writeAudit(
      { actorPersonId: actor.personId, entitySchema: 'core', entityTable: 'season', entityId: s.id, action: 'INSERT', after: s },
      client
    );
    return s;
  });
}

export interface SeasonPatch {
  code?: string;
  nameI18n?: I18nText;
  startsOn?: string;
  endsOn?: string;
}

/** 시즌 정보 수정 (코드·이름·기간 정정). is_current 는 setCurrentSeason 이 따로 다룬다. */
export async function updateSeason(
  id: UUID,
  patch: SeasonPatch,
  actor: { personId?: UUID | null } = {}
): Promise<Season> {
  return tx(async (client) => {
    const before = (await client.query<Season>(`SELECT * FROM core.season WHERE id=$1`, [id])).rows[0];
    if (!before) throw new Error('season not found');
    const has = <K extends keyof SeasonPatch>(k: K) => patch[k] !== undefined;
    const m = {
      code: has('code') ? patch.code!.trim() : before.code,
      name_i18n: has('nameI18n') ? patch.nameI18n : before.name_i18n,
      starts_on: has('startsOn') ? patch.startsOn : before.starts_on,
      ends_on: has('endsOn') ? patch.endsOn : before.ends_on,
    };
    const res = await client.query<Season>(
      `UPDATE core.season
          SET code=$2, name_i18n=$3::jsonb, starts_on=$4::date, ends_on=$5::date
        WHERE id=$1
      RETURNING id, code, name_i18n, scope_type, scope_ref_id, starts_on::text, ends_on::text, is_current`,
      [id, m.code, JSON.stringify(m.name_i18n), m.starts_on, m.ends_on]
    );
    const after = res.rows[0];
    await writeAudit(
      {
        actorPersonId: actor.personId, entitySchema: 'core', entityTable: 'season', entityId: id,
        action: 'UPDATE', before, after,
      },
      client
    );
    return after;
  });
}

/**
 * 현재 시즌 지정 — 같은 범위(scope)에서 하나만 현재일 수 있으므로,
 * 같은 범위의 나머지는 현재 해제하고 이 회기만 현재로 만든다(한 트랜잭션).
 */
export async function setCurrentSeason(id: UUID, actor: { personId?: UUID | null } = {}): Promise<void> {
  await tx(async (client) => {
    const target = (await client.query<Season>(`SELECT * FROM core.season WHERE id = $1`, [id])).rows[0];
    if (!target) throw new Error('season not found');
    await client.query(
      `UPDATE core.season SET is_current = false
        WHERE scope_type = $1 AND scope_ref_id IS NOT DISTINCT FROM $2 AND id <> $3`,
      [target.scope_type, target.scope_ref_id, id]
    );
    await client.query(`UPDATE core.season SET is_current = true WHERE id = $1`, [id]);
    await writeAudit(
      {
        actorPersonId: actor.personId, entitySchema: 'core', entityTable: 'season', entityId: id,
        action: 'SET_CURRENT', before: { is_current: target.is_current }, after: { is_current: true },
      },
      client
    );
  });
}
