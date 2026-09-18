import { listSports } from '@vsp/sport-domain';
import { getOrgTree, t as pick } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader } from '@vsp/web-shared/ui';
import { EventForm } from './EventForm';
import { requireWorkspace } from '@/lib/session';

export const dynamic = 'force-dynamic';

function flatten(
  nodes: Awaited<ReturnType<typeof getOrgTree>>,
  locale: Locale,
  depth = 0
): Array<{ id: string; label: string }> {
  return nodes.flatMap((n) => [
    { id: n.id, label: `${'— '.repeat(depth)}${pick(n.name_i18n, locale)}` },
    ...flatten(n.children, locale, depth + 1),
  ]);
}

export default async function NewEventPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  // 업무 권한 확인 — 레이아웃이 아니라 화면마다 한다 (lib/session 설명 참조)
  await requireWorkspace(locale);
  const t = getMessages(locale);

  const [sports, tree] = await Promise.all([listSports({ onlyActive: true }), getOrgTree()]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t('event.create')} subtitle={t('event.approval')} />
      <EventForm
        locale={locale}
        sports={sports.map((s) => ({ id: s.id, label: pick(s.name_i18n, locale) }))}
        orgs={flatten(tree, locale)}
        labels={{
          name: t('event.name'),
          sport: t('nav.sports'),
          host: t('event.host'),
          level: t('event.level'),
          period: t('event.period'),
          venue: t('event.venue'),
          entryCloses: t('event.entryPeriod'),
          save: t('common.submit'),
        }}
      />
    </div>
  );
}
