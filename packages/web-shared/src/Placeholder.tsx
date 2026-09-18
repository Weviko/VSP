import { PageHeader } from './ui';

/**
 * 아직 구현하지 않은 메뉴.
 *
 * 빈 404 대신 "무엇이 들어올 자리인지"를 보여준다.
 * 문체부 미팅에서 전체 그림을 설명해야 하므로, 계획된 기능을 명시하는 편이
 * 없는 페이지로 두는 것보다 낫다.
 */
export function Placeholder({
  title,
  planned,
  note,
}: {
  title: string;
  planned: string[];
  note?: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} />
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8">
        <p className="text-sm font-medium text-slate-500">Planned</p>
        <ul className="mt-3 space-y-2">
          {planned.map((p) => (
            <li key={p} className="flex gap-2 text-slate-700">
              <span className="text-slate-300">·</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
        {note ? <p className="mt-4 text-sm text-slate-500">{note}</p> : null}
      </div>
    </div>
  );
}
