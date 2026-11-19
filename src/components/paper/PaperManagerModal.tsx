import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Copy,
  Archive,
  ArchiveRestore,
  FileText,
  FolderOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { usePaperStore } from "../../stores/paperStore";
import { iconBtn, inputCls, primaryBtn, secondaryBtn } from "../../lib/ui/styles";

type PaperFilter =
  | "all"
  | "full"
  | "specialty"
  | "imported"
  | "draft"
  | "archived";
type PaperSort = "updated" | "created" | "title";

interface PaperManagerModalProps {
  onClose: () => void;
}

/** Paper library manager with settings-modal-like structure and paper actions. */
export function PaperManagerModal({ onClose }: PaperManagerModalProps) {
  const { t } = useTranslation();
  const papers = usePaperStore((s) => s.papers);
  const activePaperId = usePaperStore((s) => s.activePaperId);
  const newPaper = usePaperStore((s) => s.newPaper);
  const openPaper = usePaperStore((s) => s.openPaper);
  const renamePaper = usePaperStore((s) => s.renamePaper);
  const duplicatePaper = usePaperStore((s) => s.duplicatePaper);
  const deletePaper = usePaperStore((s) => s.deletePaper);
  const archivePapers = usePaperStore((s) => s.archivePapers);
  const [selectedId, setSelectedId] = useState(activePaperId);
  const [titleDraft, setTitleDraft] = useState(
    papers.find((paper) => paper.id === activePaperId)?.title ?? "",
  );
  const [filter, setFilter] = useState<PaperFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<PaperSort>("updated");
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const visiblePapers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return papers
      .filter((paper) => {
        if (filter === "archived") return paper.archived;
        if (paper.archived) return false;
        if (filter !== "all" && paper.kind !== filter) return false;
        if (!normalizedQuery) return true;
        return [
          paper.title,
          paper.examDate,
          paper.setLabel,
          paper.topicSummary,
          ...paper.stageLabels,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((left, right) => {
        if (sort === "title") return left.title.localeCompare(right.title, "zh-CN");
        if (sort === "created") return right.createdAt.localeCompare(left.createdAt);
        return right.updatedAt.localeCompare(left.updatedAt);
      });
  }, [filter, papers, query, sort]);

  const selected =
    visiblePapers.find((paper) => paper.id === selectedId) ??
    visiblePapers[0] ??
    null;

  useEffect(() => {
    const next =
      visiblePapers.find((paper) => paper.id === selectedId) ??
      visiblePapers[0] ??
      null;
    if (!next) {
      setSelectedId(null);
      setTitleDraft("");
      return;
    }
    if (next.id !== selectedId) {
      setSelectedId(next.id);
      setTitleDraft(next.title);
    }
  }, [selectedId, visiblePapers]);

  function selectPaper(id: string) {
    const paper = papers.find((item) => item.id === id);
    setSelectedId(id);
    setTitleDraft(paper?.title ?? "");
  }

  async function createAndSelect() {
    await newPaper();
    const active = usePaperStore.getState().activePaperId;
    if (active) selectPaper(active);
  }

  async function openSelected() {
    if (!selected) return;
    await openPaper(selected.id);
    onClose();
  }

  async function saveTitle() {
    if (!selected) return;
    await renamePaper(selected.id, titleDraft);
  }

  function toggleChecked(id: string) {
    if (id === activePaperId) return;
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function archiveChecked() {
    if (checkedIds.size === 0) return;
    await archivePapers([...checkedIds], filter !== "archived");
    setCheckedIds(new Set());
  }

  return (
    <div
      className="fixed inset-0 z-50 grid animate-fade-in place-items-center bg-black/50 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("paperLibrary.title")}
        className="flex h-[86vh] max-h-[42rem] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <FolderOpen className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">
                {t("paperLibrary.title")}
              </h2>
              <p className="truncate text-xs text-muted-foreground">
                {t("paperLibrary.subtitle")}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label={t("settings.cancel")}
            title={t("settings.cancel")}
            onClick={onClose}
            className={iconBtn}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr] sm:grid-cols-[18rem_minmax(0,1fr)] sm:grid-rows-1">
          <aside className="flex min-h-0 flex-col border-b border-border bg-muted/35 p-3 sm:border-b-0 sm:border-r">
            <button
              type="button"
              onClick={() => void createAndSelect()}
              className={primaryBtn}
            >
              <Plus className="h-4 w-4" />
              {t("paperLibrary.newPaper")}
            </button>
            <label className="relative mt-2 block">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.currentTarget.value);
                  setCheckedIds(new Set());
                }}
                placeholder={t("paperLibrary.searchPlaceholder")}
                aria-label={t("paperLibrary.search")}
                className={`${inputCls} h-9 pl-8 text-xs`}
              />
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <select
                value={filter}
                aria-label={t("paperLibrary.filter")}
                onChange={(event) => {
                  setFilter(event.currentTarget.value as PaperFilter);
                  setCheckedIds(new Set());
                }}
                className="h-8 rounded border border-border bg-background px-2 text-xs text-foreground"
              >
                {(
                  [
                    "all",
                    "full",
                    "specialty",
                    "imported",
                    "draft",
                    "archived",
                  ] as const
                ).map((value) => (
                  <option key={value} value={value}>
                    {t(`paperLibrary.filterOption.${value}`)}
                  </option>
                ))}
              </select>
              <select
                value={sort}
                aria-label={t("paperLibrary.sort")}
                onChange={(event) =>
                  setSort(event.currentTarget.value as PaperSort)
                }
                className="h-8 rounded border border-border bg-background px-2 text-xs text-foreground"
              >
                {(["updated", "created", "title"] as const).map((value) => (
                  <option key={value} value={value}>
                    {t(`paperLibrary.sortOption.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 rounded border border-border bg-background px-2 py-1.5 text-xs">
              <span className="text-muted-foreground">
                {t("paperLibrary.selectedCount", { count: checkedIds.size })}
              </span>
              <button
                type="button"
                disabled={checkedIds.size === 0}
                onClick={() => void archiveChecked()}
                className="inline-flex items-center gap-1 text-primary disabled:opacity-40"
              >
                {filter === "archived" ? (
                  <ArchiveRestore className="h-3.5 w-3.5" />
                ) : (
                  <Archive className="h-3.5 w-3.5" />
                )}
                {t(
                  filter === "archived"
                    ? "paperLibrary.restore"
                    : "paperLibrary.archive",
                )}
              </button>
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-auto">
              <ul className="space-y-1">
                {visiblePapers.map((paper) => (
                  <li key={paper.id}>
                    <div
                      className={
                        paper.id === selected?.id
                          ? "flex items-center gap-2 rounded-md bg-card px-2 py-2 text-sm text-foreground shadow-sm ring-1 ring-border"
                          : "flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checkedIds.has(paper.id)}
                        disabled={paper.id === activePaperId}
                        onChange={() => toggleChecked(paper.id)}
                        aria-label={t("paperLibrary.selectPaper", {
                          title: paper.title,
                        })}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      <button
                        type="button"
                        onClick={() => selectPaper(paper.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <FileText className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{paper.title}</span>
                          <span className="mt-0.5 flex flex-wrap gap-1">
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                              {t(`paperLibrary.kind.${paper.kind}`)}
                            </span>
                            {paper.stageLabels.slice(0, 2).map((label) => (
                              <span
                                key={label}
                                className="rounded border border-border px-1.5 py-0.5 text-[10px]"
                              >
                                {label}
                              </span>
                            ))}
                          </span>
                        </span>
                        {paper.id === activePaperId && (
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                        )}
                      </button>
                    </div>
                  </li>
                ))}
                {visiblePapers.length === 0 && (
                  <li className="rounded border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                    {t("paperLibrary.noMatches")}
                  </li>
                )}
              </ul>
            </div>
          </aside>

          <section className="min-h-0 overflow-auto p-4 sm:p-6">
            {selected ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground">
                    {t("paperLibrary.paperTitle")}
                  </label>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.currentTarget.value)}
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() => void saveTitle()}
                      className={`${secondaryBtn} whitespace-nowrap`}
                    >
                      <Pencil className="h-4 w-4" />
                      {t("settings.save")}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 divide-x divide-border rounded-md border border-border bg-background">
                  <div className="p-3">
                    <p className="text-xs text-muted-foreground">{t("paperLibrary.questions")}</p>
                    <p className="mt-1 truncate text-sm font-medium text-foreground">{String(selected.questionCount)}</p>
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-muted-foreground">{t("paperLibrary.createdAt")}</p>
                    <p className="mt-1 truncate text-sm font-medium text-foreground">{formatDate(selected.createdAt)}</p>
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-muted-foreground">{t("paperLibrary.updatedAt")}</p>
                    <p className="mt-1 truncate text-sm font-medium text-foreground">{formatDate(selected.updatedAt)}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                  <button
                    type="button"
                    onClick={() => void openSelected()}
                    className={primaryBtn}
                  >
                    <FolderOpen className="h-4 w-4" />
                    {t("paperLibrary.open")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void duplicatePaper(selected.id)}
                    className={secondaryBtn}
                  >
                    <Copy className="h-4 w-4" />
                    {t("paperLibrary.duplicate")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deletePaper(selected.id)}
                    className="inline-flex items-center gap-2 rounded-md border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("settings.delete")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid h-full place-items-center rounded-md border border-dashed border-border bg-muted/30 p-8 text-center">
                <div>
                  <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("paperLibrary.empty")}
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}
