import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  getAthlete, listAthleteRegistrations, listAthleteResults, subscriberCount, cheerCount,
  REG_TYPE_LABELS, t as pick,
} from '@vsp/public-data';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { Card, EmptyState, Table, Tr, Td, Badge } from '@vsp/web-shared/ui';

/**
 * 선수 공개 프로필.
 *
 * 누가 공개 대상인지는 이 화면이 판단하지 않는다 — 공개 뷰(pub.athlete)가 정한다.
 *   승인된 선수 등록이 있고, 성인이거나 보호자 초상권 동의가 있는 사람만 나온다.
 *   협회 직원·반려된 신청자·동의 없는 미성년의 id 를 넣으면 404 다.
 * 생년월일 전체·연락처·주소·신분증·건강정보는 뷰에 칼럼이 없어 화면이 가져올 방법이 없다.
 */
export const dynamic = 'force-dynamic';

export default async function AthleteProfile({
  params,
}: {
  params: Promise<{ locale: string; personId: string }>;
}) {
  const { locale: raw, personId } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  const t = getMessages(locale);

  const person = await getAthlete(personId);
  if (!person) notFound();

  const [regs, results, followers, cheers] = await Promise.all([
    listAthleteRegistrations({ personId: person.id, limit: 20 }),
    listAthleteResults(person.id),
    subscriberCount('PERSON', person.id).catch(() => 0),
    cheerCount('PERSON', person.id).catch(() => 0),
  ]);
  const platformUrl = process.env.VSP_PLATFORM_URL ?? 'http://localhost:3001';
  // 메달 집계 (금·은·동)
  const medals = { GOLD: 0, SILVER: 0, BRONZE: 0 };
  for (const r of results) if (r.medal && r.medal in medals) medals[r.medal as keyof typeof medals] += 1;
  const podiums = medals.GOLD + medals.SILVER + medals.BRONZE;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start gap-6">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-lg bg-slate-200">
          {person.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={person.photo_url} alt={person.full_name} className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{person.full_name}</h1>
          {person.name_latin ? <p className="text-slate-500">{person.name_latin}</p> : null}
          <p className="mt-2 text-sm text-slate-600 tabular-nums">
            {person.birth_year}
            {person.gender ? ` · ${person.gender}` : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {regs.map((r) => (
              <Badge key={r.id}>
                {pick(r.sport_name, locale)} · {pick(REG_TYPE_LABELS.ATHLETE, locale)}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* 인기·성과 지표 + 구독·응원 (실제 참여는 로그인 플랫폼에서) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-2xl font-bold tabular-nums text-slate-900">{followers.toLocaleString()}</p>
          <p className="text-xs text-slate-500">{t('poll.followers')}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-2xl font-bold tabular-nums text-rose-600">♥ {cheers.toLocaleString()}</p>
          <p className="text-xs text-slate-500">{t('poll.cheerCount')}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-2xl font-bold tabular-nums text-slate-900">{podiums}</p>
          <p className="text-xs text-slate-500">🥇 {medals.GOLD} · 🥈 {medals.SILVER} · 🥉 {medals.BRONZE}</p>
        </div>
        <a href={`${platformUrl}/${locale}/login`} className="flex flex-col items-center justify-center rounded-lg border border-slate-300 bg-slate-50 p-4 text-center hover:bg-slate-100">
          <span className="text-sm font-medium text-slate-800">♡ {t('athlete.followCheer')}</span>
          <span className="mt-0.5 text-xs text-slate-500">{t('athlete.loginToJoin')}</span>
        </a>
      </div>

      <Card>
        <p className="text-sm text-slate-600">
          {regs.map((r) => pick(r.org_name, locale)).filter(Boolean).join(' · ') || '—'}
        </p>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('event.results')}</h2>
        {results.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <Table head={[t('event.name'), t('event.rank'), t('event.medal'), t('org.name')]}>
            {results.map((r) => (
              <Tr key={r.id}>
                <Td>
                  <Link
                    href={`/${locale}/events/${r.event_id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {pick(r.event_name, locale)}
                  </Link>
                </Td>
                <Td className="tabular-nums">{r.final_rank ?? '—'}</Td>
                <Td>{r.medal ? <Badge tone="amber">{r.medal}</Badge> : '—'}</Td>
                <Td className="text-slate-600">{r.org_name ? pick(r.org_name, locale) : '—'}</Td>
              </Tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
