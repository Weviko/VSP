/**
 * DB 미연결 안내.
 * 개발 초기에 Docker가 아직 없을 때 빈 화면 대신 다음 할 일을 보여준다.
 */
export function DbNotice({ title, hint, error }: { title: string; hint: string; error?: string }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-5">
      <p className="font-semibold text-amber-900">{title}</p>
      <p className="mt-1 text-sm text-amber-800">{hint}</p>
      {error ? (
        <pre className="mt-3 overflow-x-auto rounded bg-amber-100 p-3 text-xs text-amber-900">
          {error}
        </pre>
      ) : null}
    </div>
  );
}
