import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getFormById, t as pick } from '@vsp/core-admin';
import { isLocale, type Locale } from '@vsp/web-shared/i18n/config';
import { getMessages } from '@vsp/web-shared/i18n';
import { PageHeader, Badge, statusTone } from '@vsp/web-shared/ui';
import { FormEditor } from './FormEditor';
import { requireWorkspace } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * 서식 편집기.
 *
 * 체육회에서 받은 서식을 그대로 옮겨 담는 화면이다.
 * 운영 중(ACTIVE)인 서식은 직접 수정하지 못하게 막는다.
 * 이미 제출된 신청서의 해석이 달라지기 때문이며, 대신 새 버전을 만들게 한다.
 */
export default async function FormEditorPage({
  params,
}: {
  params: Promise<{ locale: string; formId: string }>;
}) {
  const { locale: raw, formId } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'vi';
  // 업무 권한 확인 — 레이아웃이 아니라 화면마다 한다 (lib/session 설명 참조)
  await requireWorkspace(locale);
  const t = getMessages(locale);

  const form = await getFormById(formId).catch(() => null);
  if (!form) notFound();

  return (
    <div className="space-y-6">
      <div>
        <nav className="mb-2 text-sm text-slate-500">
          <Link href={`/${locale}/admin/settings`} className="hover:underline">
            {t('settings.title')}
          </Link>
          <span className="mx-1">/</span>
        </nav>
        <PageHeader
          title={pick(form.title_i18n, locale)}
          subtitle={`${form.code} · v${form.version}${form.sla_days ? ` · SLA ${form.sla_days}d` : ''}`}
          right={<Badge tone={statusTone(form.status)}>{form.status}</Badge>}
        />
      </div>

      <FormEditor
        locale={locale}
        formId={form.id}
        status={form.status}
        fields={form.fields.map((f) => ({
          id: f.id,
          field_key: f.field_key,
          label: pick(f.label_i18n, locale),
          labelVi: f.label_i18n.vi ?? '',
          data_type: f.data_type,
          is_required: f.is_required,
          section: f.section,
          sort_order: f.sort_order,
          options: (f.options ?? []).map((o) => `${o.value}=${pick(o.label_i18n, locale)}`).join('\n'),
        }))}
        labels={{
          addField: t('settings.addField'),
          fieldKey: t('settings.fieldKey'),
          label: t('settings.label'),
          type: t('settings.type'),
          required: t('settings.required'),
          section: t('settings.section'),
          options: t('settings.options'),
          clone: t('settings.clone'),
          activate: t('settings.activate'),
          archive: t('settings.archive'),
          save: t('common.save'),
          cancel: t('common.cancel'),
          del: t('common.delete'),
          edit: t('common.edit'),
          locked: t('settings.lockedHint'),
          empty: t('common.noData'),
        }}
      />
    </div>
  );
}
