import { getOrgTree, listLevelTypes, t as pick } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader } from '@vsp/web-shared/ui';
import { OrgForm } from './OrgForm';
import { requireWorkspace } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** 조직 트리를 평면 선택지로 만든다 (상급 조직 선택용) */
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

export default async function NewOrgPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  // 업무 권한 확인 — 레이아웃이 아니라 화면마다 한다 (lib/session 설명 참조)
  await requireWorkspace(locale);
  const t = getMessages(locale);

  const [tree, levels] = await Promise.all([getOrgTree({ includeInactive: true }), listLevelTypes()]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t('org.create')} subtitle={t('org.subtitle')} />
      <OrgForm
        locale={locale}
        parents={flatten(tree, locale)}
        levels={levels.map((l) => ({ code: l.code, label: pick(l.name_i18n, locale) }))}
        labels={{
          name: t('org.name'),
          levelType: t('org.levelType'),
          parent: t('org.parent'),
          region: t('org.region'),
          save: t('common.save'),
          required: t('common.required'),
        }}
      />
    </div>
  );
}
