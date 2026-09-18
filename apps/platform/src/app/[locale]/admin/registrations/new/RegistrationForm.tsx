'use client';

import { useState } from 'react';
import type { FormWithFields } from '@vsp/core-admin/form-schema';
import type { Locale } from '@vsp/web-shared/i18n/config';
import { FormRenderer, type FormLabels } from '@/components/FormRenderer';
import { submitAthleteRegistration } from '../actions';

export function RegistrationForm({
  form,
  locale,
  labels,
}: {
  form: FormWithFields;
  locale: Locale;
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
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {failed}
        </div>
      ) : null}
      <FormRenderer
        form={form}
        locale={locale}
        labels={labels}
        onSubmit={async (data) => {
          const res = await submitAthleteRegistration(data);
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
