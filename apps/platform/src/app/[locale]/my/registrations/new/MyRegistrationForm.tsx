'use client';

import { useState } from 'react';
import type { FormWithFields } from '@vsp/core-admin/form-schema';
import type { Locale } from '@vsp/web-shared/i18n/config';
import { FormRenderer, type FormLabels } from '@/components/FormRenderer';
import { submitMyRegistration } from './actions';

/**
 * 회원 셀프 등록 폼. 스태프 등록 폼과 같은 동적 폼(FormRenderer)을 쓰되,
 * 소속 단체 선택지(orgOptions)는 회원 본인의 소속만 준다(팀 필드 = org).
 */
export function MyRegistrationForm({
  form,
  locale,
  orgOptions,
  labels,
}: {
  form: FormWithFields;
  locale: Locale;
  orgOptions: Array<{ id: string; label: string }>;
  labels: FormLabels;
}) {
  const [done, setDone] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  if (done) {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-5">
        <p className="font-semibold text-emerald-900">OK</p>
        <p className="mt-1 font-mono text-xs text-emerald-800">{done}</p>
      </div>
    );
  }

  return (
    <>
      {failed ? (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{failed}</div>
      ) : null}
      <FormRenderer
        form={form}
        locale={locale}
        orgOptions={orgOptions}
        labels={labels}
        onSubmit={async (data) => {
          const res = await submitMyRegistration(locale, data);
          if (res.ok && res.submissionId) {
            setDone(res.submissionId);
            return;
          }
          if (res.message) setFailed(res.message);
          return { errors: res.errors };
        }}
      />
    </>
  );
}
