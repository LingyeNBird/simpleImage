"use client";

import { Copy, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createImagePrompt,
  deleteImagePrompt,
  fetchImagePromptLibrary,
  updateImagePrompt,
  type PromptLibraryItem,
} from "@/lib/api";

type PromptLibraryDraft = {
  title?: string;
  prompt: string;
};

type PromptLibraryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsertPrompt: (prompt: string) => void;
  uploadDraft?: PromptLibraryDraft | null;
  onUploadDraftConsumed?: () => void;
};

function normalizeTagsInput(value: string) {
  const tags = value
    .split(/[#,，,;；\n\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(tags.map((tag) => tag.toLowerCase()))).map((lowered) => {
    const original = tags.find((tag) => tag.toLowerCase() === lowered);
    return original || lowered;
  });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function PromptLibraryDialog({
  open,
  onOpenChange,
  onInsertPrompt,
  uploadDraft,
  onUploadDraftConsumed,
}: PromptLibraryDialogProps) {
  const [items, setItems] = useState<PromptLibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadItems = useCallback(async (nextSearch: string, nextMineOnly: boolean) => {
    setIsLoading(true);
    try {
      const data = await fetchImagePromptLibrary({ search: nextSearch, mine: nextMineOnly });
      setItems(data.items);
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载提示词库失败";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    void loadItems(search, mineOnly);
  }, [loadItems, mineOnly, open, search]);

  useEffect(() => {
    if (!open || !uploadDraft) {
      return;
    }
    setIsEditorOpen(true);
    setEditingId(null);
    setTitle(uploadDraft.title || "");
    setPrompt(uploadDraft.prompt || "");
    setTagsText("");
    onUploadDraftConsumed?.();
  }, [onUploadDraftConsumed, open, uploadDraft]);

  const parsedTags = useMemo(() => normalizeTagsInput(tagsText), [tagsText]);

  const resetEditor = () => {
    setEditingId(null);
    setTitle("");
    setPrompt("");
    setTagsText("");
    setIsEditorOpen(false);
  };

  const startCreate = () => {
    setEditingId(null);
    setTitle(uploadDraft?.title || "");
    setPrompt(uploadDraft?.prompt || "");
    setTagsText("");
    setIsEditorOpen(true);
  };

  const startEdit = (item: PromptLibraryItem) => {
    setEditingId(item.id);
    setTitle(item.title);
    setPrompt(item.prompt);
    setTagsText(item.tags.join(", "));
    setIsEditorOpen(true);
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制提示词");
    } catch {
      toast.error("复制失败");
    }
  };

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      toast.error("请填写提示词");
      return;
    }
    if (parsedTags.length === 0) {
      toast.error("请至少填写一个 tag");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingId) {
        await updateImagePrompt(editingId, { title: title.trim(), prompt: prompt.trim(), tags: parsedTags });
        toast.success("已更新提示词");
      } else {
        await createImagePrompt({ title: title.trim(), prompt: prompt.trim(), tags: parsedTags });
        toast.success("已上传到提示词库");
      }
      resetEditor();
      await loadItems(search, mineOnly);
    } catch (error) {
      const message = error instanceof Error ? error.message : editingId ? "更新提示词失败" : "上传提示词失败";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (item: PromptLibraryItem) => {
    const confirmed = typeof window === "undefined" ? true : window.confirm(`确定删除“${item.title || item.prompt.slice(0, 20)}”吗？`);
    if (!confirmed) {
      return;
    }
    try {
      await deleteImagePrompt(item.id);
      toast.success("已删除提示词");
      if (expandedId === item.id) {
        setExpandedId(null);
      }
      await loadItems(search, mineOnly);
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除提示词失败";
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] w-[min(96vw,920px)] overflow-hidden rounded-[28px] border-stone-200 bg-[#fbfaf8] p-0">
        <div className="flex max-h-[88vh] flex-col">
          <DialogHeader className="border-b border-stone-200 px-6 py-5">
            <DialogTitle>生图提示词库</DialogTitle>
            <DialogDescription>可搜索内容或 tag，支持共享查看、插入、复制，以及上传自己的提示词。</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 px-6 py-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索提示词内容、标题或 tag"
                  className="h-11 rounded-full border-stone-200 bg-white pl-10"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={mineOnly ? "outline" : "default"}
                  className={mineOnly ? "rounded-full border-stone-200 bg-white text-stone-700" : "rounded-full bg-stone-950 text-white hover:bg-stone-800"}
                  onClick={() => setMineOnly(false)}
                >
                  全部提示词
                </Button>
                <Button
                  type="button"
                  variant={mineOnly ? "default" : "outline"}
                  className={mineOnly ? "rounded-full bg-stone-950 text-white hover:bg-stone-800" : "rounded-full border-stone-200 bg-white text-stone-700"}
                  onClick={() => setMineOnly(true)}
                >
                  只看我上传的
                </Button>
                <Button type="button" className="rounded-full" onClick={startCreate}>
                  <Plus className="size-4" />
                  上传提示词
                </Button>
              </div>
            </div>

            {isEditorOpen ? (
              <div className="rounded-[24px] border border-stone-200 bg-white p-4 shadow-sm">
                <div className="mb-3 text-sm font-semibold text-stone-900">{editingId ? "编辑提示词" : "上传提示词"}</div>
                <div className="grid gap-3">
                  <Input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="标题（可选）"
                    className="rounded-2xl border-stone-200"
                  />
                  <Textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="填写生图提示词"
                    className="min-h-[140px] rounded-2xl border-stone-200"
                  />
                  <Input
                    value={tagsText}
                    onChange={(event) => setTagsText(event.target.value)}
                    placeholder="填写 tag，多个可用空格、逗号或 # 分隔"
                    className="rounded-2xl border-stone-200"
                  />
                  <div className="flex flex-wrap gap-2">
                    {parsedTags.length > 0 ? parsedTags.map((tag) => <Badge key={tag} variant="secondary" className="rounded-full bg-stone-100 text-stone-700">#{tag}</Badge>) : <span className="text-xs text-stone-400">至少需要 1 个 tag</span>}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="outline" className="rounded-full border-stone-200 bg-white text-stone-700" onClick={resetEditor}>
                      取消
                    </Button>
                    <Button type="button" className="rounded-full" disabled={isSubmitting} onClick={() => void handleSubmit()}>
                      {isSubmitting ? "提交中..." : editingId ? "保存修改" : "上传到提示词库"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
              <div className="grid gap-3">
                {isLoading ? (
                  <div className="rounded-[24px] border border-dashed border-stone-200 bg-white px-5 py-10 text-center text-sm text-stone-500">
                    正在加载提示词库...
                  </div>
                ) : items.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-stone-200 bg-white px-5 py-10 text-center text-sm text-stone-500">
                    还没有匹配的提示词，试试上传第一条。
                  </div>
                ) : (
                  items.map((item) => {
                    const expanded = expandedId === item.id;
                    const visibleTags = item.tags.slice(0, 3);
                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setExpandedId(expanded ? null : item.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setExpandedId(expanded ? null : item.id);
                          }
                        }}
                        className="cursor-pointer rounded-[24px] border border-stone-200 bg-white p-4 text-left transition hover:border-stone-300"
                      >
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-stone-900">{item.title || item.prompt.slice(0, 32) || "未命名提示词"}</div>
                              <div className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-stone-600">{item.prompt}</div>
                            </div>
                            <div className="shrink-0 text-right text-xs text-stone-400">
                              <div>{item.owner_name}</div>
                              <div>{formatDateTime(item.updated_at || item.created_at)}</div>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {visibleTags.map((tag) => (
                              <Badge key={`${item.id}-${tag}`} variant="secondary" className="rounded-full bg-stone-100 text-stone-700">
                                #{tag}
                              </Badge>
                            ))}
                            {item.tags.length > visibleTags.length ? (
                              <span className="text-xs text-stone-400">+{item.tags.length - visibleTags.length}</span>
                            ) : null}
                          </div>
                          {expanded ? (
                            <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-3">
                              <Button
                                type="button"
                                variant="outline"
                                className="rounded-full border-stone-200 bg-white text-stone-700"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleCopy(item.prompt);
                                }}
                              >
                                <Copy className="size-4" />
                                复制
                              </Button>
                              <Button
                                type="button"
                                className="rounded-full"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onInsertPrompt(item.prompt);
                                  toast.success("已插入到输入框");
                                  onOpenChange(false);
                                }}
                              >
                                插入到输入框
                              </Button>
                              {item.can_edit ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="rounded-full border-stone-200 bg-white text-stone-700"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    startEdit(item);
                                  }}
                                >
                                  <Pencil className="size-4" />
                                  编辑
                                </Button>
                              ) : null}
                              {item.can_delete ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="rounded-full border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleDelete(item);
                                  }}
                                >
                                  <Trash2 className="size-4" />
                                  删除
                                </Button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
