"use client";

import { ArrowUp, CircleHelp, ImagePlus, LoaderCircle, Settings2, X } from "lucide-react";
import { useMemo, useState, type ClipboardEvent, type ReactNode, type RefObject } from "react";

import { ImageLightbox } from "@/components/image-lightbox";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";
import {
  IMAGE_RESPONSE_CANVAS_OPTIONS,
  IMAGE_RESPONSE_MODERATION_OPTIONS,
  IMAGE_RESPONSE_OUTPUT_FORMAT_OPTIONS,
  IMAGE_RESPONSE_QUALITY_OPTIONS,
  IMAGE_RESPONSE_REASONING_EFFORT_OPTIONS,
  IMAGE_RESPONSE_REASONING_SUMMARY_OPTIONS,
  IMAGE_RESPONSE_RESOLUTION_OPTIONS,
  IMAGE_RESPONSE_TOOL_CHOICE_OPTIONS,
  IMAGE_SIZE_LABELS,
  IMAGE_SIZE_OPTIONS,
  IMAGE_UPSTREAM_ENDPOINT_OPTIONS,
  type ImageResponseCanvas,
  type ImageResponseModeration,
  type ImageResponseOutputFormat,
  type ImageResponseQuality,
  type ImageResponseReasoningEffort,
  type ImageResponseReasoningSummary,
  type ImageResponseResolution,
  type ImageResponseToolChoice,
  type ImageUpstreamEndpoint,
} from "@/lib/image-generation-options";
import type { ImageDeliveryMode } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ImageConversationMode } from "@/store/image-conversations";

type ImageComposerProps = {
  mode: ImageConversationMode;
  prompt: string;
  imageCount: string;
  imageSize: string;
  upstreamEndpoint: ImageUpstreamEndpoint;
  responseCanvas: ImageResponseCanvas;
  responseResolution: ImageResponseResolution;
  responseQuality: ImageResponseQuality;
  responseOutputFormat: ImageResponseOutputFormat;
  responseOutputCompression: string;
  responseModeration: ImageResponseModeration;
  responseMainModel: string;
  responseToolModel: string;
  responseInstructions: string;
  responseReasoningEffort: ImageResponseReasoningEffort;
  responseReasoningSummary: ImageResponseReasoningSummary;
  responseParallelToolCalls: boolean;
  responseIncludeEncryptedReasoning: boolean;
  responseStore: boolean;
  responsePartialImages: string;
  responseToolChoice: ImageResponseToolChoice;
  deliveryMode: ImageDeliveryMode;
  availableDeliveryModes: ImageDeliveryMode[];
  showAllDeliveryModes?: boolean;
  activeTaskCount: number;
  referenceImages: Array<{ name: string; dataUrl: string }>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onModeChange: (value: ImageConversationMode) => void;
  onPromptChange: (value: string) => void;
  onImageCountChange: (value: string) => void;
  onImageSizeChange: (value: string) => void;
  onUpstreamEndpointChange: (value: ImageUpstreamEndpoint) => void;
  onResponseCanvasChange: (value: ImageResponseCanvas) => void;
  onResponseResolutionChange: (value: ImageResponseResolution) => void;
  onResponseQualityChange: (value: ImageResponseQuality) => void;
  onResponseOutputFormatChange: (value: ImageResponseOutputFormat) => void;
  onResponseOutputCompressionChange: (value: string) => void;
  onResponseModerationChange: (value: ImageResponseModeration) => void;
  onResponseMainModelChange: (value: string) => void;
  onResponseToolModelChange: (value: string) => void;
  onResponseInstructionsChange: (value: string) => void;
  onResponseReasoningEffortChange: (value: ImageResponseReasoningEffort) => void;
  onResponseReasoningSummaryChange: (value: ImageResponseReasoningSummary) => void;
  onResponseParallelToolCallsChange: (value: boolean) => void;
  onResponseIncludeEncryptedReasoningChange: (value: boolean) => void;
  onResponseStoreChange: (value: boolean) => void;
  onResponsePartialImagesChange: (value: string) => void;
  onResponseToolChoiceChange: (value: ImageResponseToolChoice) => void;
  onDeliveryModeChange: (value: ImageDeliveryMode) => void;
  onSubmit: () => void | Promise<void>;
  onPickReferenceImage: () => void;
  onReferenceImageChange: (files: File[]) => void | Promise<void>;
  onRemoveReferenceImage: (index: number) => void;
};

export function ImageComposer({
  mode,
  prompt,
  imageCount,
  imageSize,
  upstreamEndpoint,
  responseCanvas,
  responseResolution,
  responseQuality,
  responseOutputFormat,
  responseOutputCompression,
  responseModeration,
  responseMainModel,
  responseToolModel,
  responseInstructions,
  responseReasoningEffort,
  responseReasoningSummary,
  responseParallelToolCalls,
  responseIncludeEncryptedReasoning,
  responseStore,
  responsePartialImages,
  responseToolChoice,
  deliveryMode,
  availableDeliveryModes,
  showAllDeliveryModes = false,
  activeTaskCount,
  referenceImages,
  textareaRef,
  fileInputRef,
  onModeChange,
  onPromptChange,
  onImageCountChange,
  onImageSizeChange,
  onUpstreamEndpointChange,
  onResponseCanvasChange,
  onResponseResolutionChange,
  onResponseQualityChange,
  onResponseOutputFormatChange,
  onResponseOutputCompressionChange,
  onResponseModerationChange,
  onResponseMainModelChange,
  onResponseToolModelChange,
  onResponseInstructionsChange,
  onResponseReasoningEffortChange,
  onResponseReasoningSummaryChange,
  onResponseParallelToolCallsChange,
  onResponseIncludeEncryptedReasoningChange,
  onResponseStoreChange,
  onResponsePartialImagesChange,
  onResponseToolChoiceChange,
  onDeliveryModeChange,
  onSubmit,
  onPickReferenceImage,
  onReferenceImageChange,
  onRemoveReferenceImage,
}: ImageComposerProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const visibleDeliveryModes = useMemo<ImageDeliveryMode[]>(
    () => (showAllDeliveryModes ? ["direct", "image_bed"] : availableDeliveryModes),
    [availableDeliveryModes, showAllDeliveryModes],
  );
  const imageBedAvailable = availableDeliveryModes.includes("image_bed");
  const lightboxImages = useMemo(
    () => referenceImages.map((image, index) => ({ id: `${image.name}-${index}`, src: image.dataUrl })),
    [referenceImages],
  );
  const isResponseEndpoint = upstreamEndpoint === "response";

  const handleTextareaPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    void onReferenceImageChange(imageFiles);
  };

  const settingsSummary = `${mode === "edit" ? "图生图" : "文生图"} · ${imageCount || "1"} 张 · ${isResponseEndpoint ? "/response" : "/conversation"}${visibleDeliveryModes.length > 1 ? ` · ${deliveryMode === "image_bed" ? "图床" : "直传"}` : ""}`;

  return (
    <div className="shrink-0 flex justify-center">
      <div style={{ width: "min(980px, 100%)" }}>
        {mode === "edit" && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              void onReferenceImageChange(Array.from(event.target.files || []));
            }}
          />
        )}

        {mode === "edit" && referenceImages.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2 px-1">
            {referenceImages.map((image, index) => (
              <div key={`${image.name}-${index}`} className="relative size-16">
                <button
                  type="button"
                  onClick={() => {
                    setLightboxIndex(index);
                    setLightboxOpen(true);
                  }}
                  className="group size-16 overflow-hidden rounded-2xl border border-stone-200 bg-stone-50 transition hover:border-stone-300"
                  aria-label={`预览参考图 ${image.name || index + 1}`}
                >
                  <img
                    src={image.dataUrl}
                    alt={image.name || `参考图 ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveReferenceImage(index);
                  }}
                  className="absolute -right-1 -top-1 inline-flex size-5 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 transition hover:border-stone-300 hover:text-stone-800"
                  aria-label={`移除参考图 ${image.name || index + 1}`}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-[32px] border border-stone-200 bg-white">
          <div
            className="relative cursor-text"
            onClick={() => {
              textareaRef.current?.focus();
            }}
          >
            <ImageLightbox
              images={lightboxImages}
              currentIndex={lightboxIndex}
              open={lightboxOpen}
              onOpenChange={setLightboxOpen}
              onIndexChange={setLightboxIndex}
            />
            <Textarea
              ref={textareaRef}
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              onPaste={handleTextareaPaste}
              placeholder={
                mode === "edit" ? "描述你希望如何修改这张参考图，可直接粘贴图片" : "输入你想要生成的画面，也可直接粘贴图片"
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void onSubmit();
                }
              }}
              className="min-h-[148px] resize-none rounded-[32px] border-0 bg-transparent px-6 pt-6 pb-20 text-[15px] leading-7 text-stone-900 shadow-none placeholder:text-stone-400 focus-visible:ring-0"
            />

            <div
              className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-white via-white/95 to-transparent px-4 pb-4 pt-6 sm:px-6"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <div className="flex items-end justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                  {mode === "edit" ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-full border-stone-200 bg-white px-4 text-sm font-medium text-stone-700 shadow-none"
                      onClick={onPickReferenceImage}
                    >
                      <ImagePlus className="size-4" />
                      {referenceImages.length > 0 ? "继续添加参考图" : "上传参考图"}
                    </Button>
                  ) : null}
                  {activeTaskCount > 0 ? (
                    <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                      <LoaderCircle className="size-3 animate-spin" />
                      {activeTaskCount} 个任务处理中或排队中
                     </div>
                  ) : null}
                  <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                    <DialogTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 rounded-full border-stone-200 bg-white px-4 text-sm font-medium text-stone-700 shadow-none"
                      >
                        <Settings2 className="size-4" />
                        生图设置
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="w-[min(96vw,760px)] max-h-[85vh] gap-0 overflow-hidden rounded-[32px] border-stone-200/80 p-0">
                      <DialogHeader className="border-b border-stone-200/80 bg-white px-5 pb-4 pt-5 sm:px-6">
                        <DialogTitle>生图设置</DialogTitle>
                        <DialogDescription>{settingsSummary}</DialogDescription>
                      </DialogHeader>

                      <div className="max-h-[calc(85vh-88px)] overflow-y-auto bg-stone-50/80 px-4 py-4 sm:px-6 sm:py-5">
                        <div className="flex flex-col gap-4">
                          <SettingsSection
                            title="基础设置"
                            description="优先放常用项，移动端打开后能更快完成核心配置。"
                          >
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                              <SettingsField label="上游端点" hint="切换 /conversation 与 /response 两条上游调用链。">
                                <Select value={upstreamEndpoint} onValueChange={(value) => onUpstreamEndpointChange(value as ImageUpstreamEndpoint)}>
                                  <SelectTrigger className={SETTINGS_CONTROL_CLASS}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {IMAGE_UPSTREAM_ENDPOINT_OPTIONS.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </SettingsField>

                              <SettingsField label="生成张数" hint="控制一次请求返回的图片数量。">
                                <Input
                                  type="number"
                                  min="1"
                                  max="10"
                                  step="1"
                                  value={imageCount}
                                  onChange={(event) => onImageCountChange(event.target.value)}
                                  className={SETTINGS_INPUT_CLASS}
                                />
                              </SettingsField>

                              {!isResponseEndpoint ? (
                                <SettingsField label="图片比例" hint="用于文生图和图生图的目标画面比例。">
                                  <Select value={imageSize} onValueChange={onImageSizeChange}>
                                    <SelectTrigger className={SETTINGS_CONTROL_CLASS} onClick={(event) => event.stopPropagation()}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {IMAGE_SIZE_OPTIONS.map((option) => (
                                        <SelectItem key={option} value={option}>
                                          {IMAGE_SIZE_LABELS[option] || option}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </SettingsField>
                              ) : null}
                            </div>
                          </SettingsSection>

                          <SettingsSection title="生图类型" description="按当前任务切换文生图或图生图。">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <ModeButton active={mode === "generate"} onClick={() => onModeChange("generate")}>
                                文生图
                              </ModeButton>
                              <ModeButton active={mode === "edit"} onClick={() => onModeChange("edit")}>
                                图生图
                              </ModeButton>
                            </div>
                          </SettingsSection>

                          {visibleDeliveryModes.length > 1 ? (
                            <SettingsSection title="传输模式" description="不同模式适合不同网络和存储场景。">
                              <div className="flex flex-col gap-3">
                                <div className="grid gap-3 sm:grid-cols-2">
                                  {visibleDeliveryModes.includes("direct") ? (
                                    <div className="flex items-center gap-2">
                                      <ModeButton active={deliveryMode === "direct"} onClick={() => onDeliveryModeChange("direct")}>
                                        直传
                                      </ModeButton>
                                      <InfoTooltip content="直接传输图片，流程更直观，但耗时通常更久。" />
                                    </div>
                                  ) : null}
                                  {visibleDeliveryModes.includes("image_bed") ? (
                                    <div className="flex items-center gap-2">
                                      <ModeButton
                                        active={deliveryMode === "image_bed"}
                                        disabled={!imageBedAvailable}
                                        onClick={() => onDeliveryModeChange("image_bed")}
                                      >
                                        图床
                                      </ModeButton>
                                      <InfoTooltip content={imageBedAvailable ? "使用图床交付结果，通常更稳，适合避免直连传输问题。" : "请先在存储桶管理中配置可用图床。"} />
                                    </div>
                                  ) : null}
                                </div>
                                <div className="rounded-2xl border border-dashed border-stone-200 bg-white/80 px-4 py-3 text-sm text-stone-600">
                                  当前：<span className="font-medium text-stone-800">{deliveryMode === "image_bed" ? "图床模式" : "直传模式"}</span>
                                </div>
                              </div>
                            </SettingsSection>
                          ) : null}

                          {isResponseEndpoint ? (
                            <>
                              <SettingsSection title="图像输出" description="控制响应式生图的画布、质量和输出形态。">
                                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                  <SettingsField label="画布" hint="决定生成区域与边距倾向。">
                                    <Select value={responseCanvas} onValueChange={(value) => onResponseCanvasChange(value as ImageResponseCanvas)}>
                                      <SelectTrigger className={SETTINGS_CONTROL_CLASS}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {IMAGE_RESPONSE_CANVAS_OPTIONS.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </SettingsField>

                                  <SettingsField label="分辨率" hint="提高分辨率会带来更高细节与更长处理时间。">
                                    <Select value={responseResolution} onValueChange={(value) => onResponseResolutionChange(value as ImageResponseResolution)}>
                                      <SelectTrigger className={SETTINGS_CONTROL_CLASS}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {IMAGE_RESPONSE_RESOLUTION_OPTIONS.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </SettingsField>

                                  <SettingsField label="质量" hint="质量越高，通常越清晰，但会增加耗时与资源消耗。">
                                    <Select value={responseQuality} onValueChange={(value) => onResponseQualityChange(value as ImageResponseQuality)}>
                                      <SelectTrigger className={SETTINGS_CONTROL_CLASS}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {IMAGE_RESPONSE_QUALITY_OPTIONS.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </SettingsField>

                                  <SettingsField label="输出格式" hint="PNG 无损，JPEG / WEBP 更适合压缩传输。">
                                    <Select value={responseOutputFormat} onValueChange={(value) => onResponseOutputFormatChange(value as ImageResponseOutputFormat)}>
                                      <SelectTrigger className={SETTINGS_CONTROL_CLASS}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {IMAGE_RESPONSE_OUTPUT_FORMAT_OPTIONS.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </SettingsField>

                                  <SettingsField label="压缩率" hint="仅对有损格式生效；留空时按自动策略处理。">
                                    <Input
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="1"
                                      value={responseOutputCompression === "auto" ? "" : responseOutputCompression}
                                      onChange={(event) => onResponseOutputCompressionChange(event.target.value || "auto")}
                                      disabled={responseOutputFormat === "png"}
                                      placeholder={responseOutputFormat === "png" ? "PNG 无压缩" : "自动"}
                                      className={cn(SETTINGS_INPUT_CLASS, "disabled:bg-stone-100 disabled:text-stone-400")}
                                    />
                                  </SettingsField>

                                  <SettingsField label="审核强度" hint="控制上游安全审核策略的严格程度。">
                                    <Select value={responseModeration} onValueChange={(value) => onResponseModerationChange(value as ImageResponseModeration)}>
                                      <SelectTrigger className={SETTINGS_CONTROL_CLASS}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {IMAGE_RESPONSE_MODERATION_OPTIONS.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </SettingsField>
                                </div>
                              </SettingsSection>

                              <SettingsSection title="模型与推理" description="把模型、推理和预览参数集中管理，减少来回滚动。">
                                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                  <SettingsField label="主模型" hint="Responses 主流程使用的模型名称。">
                                    <Input
                                      value={responseMainModel}
                                      onChange={(event) => onResponseMainModelChange(event.target.value)}
                                      className={SETTINGS_INPUT_CLASS}
                                    />
                                  </SettingsField>

                                  <SettingsField label="工具模型" hint="用于图像工具调用的模型，可留 auto 自动决策。">
                                    <Input
                                      value={responseToolModel}
                                      onChange={(event) => onResponseToolModelChange(event.target.value)}
                                      placeholder="auto / gpt-image-2"
                                      className={SETTINGS_INPUT_CLASS}
                                    />
                                  </SettingsField>

                                  <SettingsField label="推理强度" hint="更高推理强度通常更稳，但速度更慢。">
                                    <Select value={responseReasoningEffort} onValueChange={(value) => onResponseReasoningEffortChange(value as ImageResponseReasoningEffort)}>
                                      <SelectTrigger className={SETTINGS_CONTROL_CLASS}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {IMAGE_RESPONSE_REASONING_EFFORT_OPTIONS.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </SettingsField>

                                  <SettingsField label="推理摘要" hint="决定是否返回简短推理摘要信息。">
                                    <Select value={responseReasoningSummary} onValueChange={(value) => onResponseReasoningSummaryChange(value as ImageResponseReasoningSummary)}>
                                      <SelectTrigger className={SETTINGS_CONTROL_CLASS}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {IMAGE_RESPONSE_REASONING_SUMMARY_OPTIONS.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </SettingsField>

                                  <SettingsField label="阶段预览数" hint="控制返回中间预览图的数量，0 表示关闭。">
                                    <Input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={responsePartialImages}
                                      onChange={(event) => onResponsePartialImagesChange(event.target.value)}
                                      className={SETTINGS_INPUT_CLASS}
                                    />
                                  </SettingsField>
                                </div>
                              </SettingsSection>

                              <SettingsSection title="行为开关" description="把低频开关收进统一风格的块状卡片里。">
                                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                  <ToggleField
                                    id="response-parallel-tool-calls"
                                    label="并行工具调用"
                                    hint="允许工具并发执行，适合复杂生成链路。"
                                    checked={responseParallelToolCalls}
                                    onCheckedChange={onResponseParallelToolCallsChange}
                                  />
                                  <ToggleField
                                    id="response-encrypted-reasoning"
                                    label="返回加密推理"
                                    hint="返回加密后的推理内容，便于上游做更完整的保留。"
                                    checked={responseIncludeEncryptedReasoning}
                                    onCheckedChange={onResponseIncludeEncryptedReasoningChange}
                                  />
                                  <ToggleField
                                    id="response-store"
                                    label="保存到上游 store"
                                    hint="将本次结果持久保存到上游侧的 store。"
                                    checked={responseStore}
                                    onCheckedChange={onResponseStoreChange}
                                  />
                                  <SettingsField label="工具选择" hint="控制是否强制使用图像工具或交给模型自动判断。">
                                    <Select value={responseToolChoice} onValueChange={(value) => onResponseToolChoiceChange(value as ImageResponseToolChoice)}>
                                      <SelectTrigger className={SETTINGS_CONTROL_CLASS}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {IMAGE_RESPONSE_TOOL_CHOICE_OPTIONS.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </SettingsField>
                                </div>
                              </SettingsSection>

                              <SettingsSection title="系统指令" description="可选，用于给 Responses 主模型补充统一约束。">
                                <Textarea
                                  value={responseInstructions}
                                  onChange={(event) => onResponseInstructionsChange(event.target.value)}
                                  placeholder="可选，补充给 Responses 主模型的 instructions"
                                  className="min-h-28 rounded-3xl border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 shadow-none focus-visible:ring-0"
                                />
                              </SettingsSection>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                </div>

                <button
                  type="button"
                  onClick={() => void onSubmit()}
                  disabled={!prompt.trim() || (mode === "edit" && referenceImages.length === 0)}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-stone-950 text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                  aria-label={mode === "edit" ? "编辑图片" : "生成图片"}
                >
                  <ArrowUp className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  children,
  onClick,
  disabled,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!disabled) {
          onClick();
        }
      }}
      disabled={disabled}
      className={cn(
        "flex min-h-12 w-full flex-1 items-center justify-center rounded-2xl border px-4 py-3 text-sm font-medium transition",
        active
          ? "border-stone-950 bg-stone-950 text-white shadow-[0_12px_30px_-18px_rgba(15,23,42,0.5)]"
          : disabled
            ? "cursor-not-allowed border-stone-200 bg-stone-100 text-stone-400"
            : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-100",
      )}
    >
      {children}
    </button>
  );
}

const SETTINGS_SECTION_CLASS =
  "rounded-[28px] border border-stone-200 bg-white p-4 shadow-[0_18px_50px_-35px_rgba(15,23,42,0.35)] sm:p-5";

const SETTINGS_FIELD_CLASS =
  "flex h-full flex-col gap-3 rounded-2xl border border-stone-200/80 bg-stone-50 px-4 py-4";

const SETTINGS_CONTROL_CLASS =
  "h-11 rounded-2xl border-stone-200 bg-white px-4 text-sm font-medium text-stone-700 shadow-none focus-visible:ring-0";

const SETTINGS_INPUT_CLASS =
  "h-11 rounded-2xl border-stone-200 bg-white px-4 text-sm font-medium text-stone-700 shadow-none focus-visible:ring-0";

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className={SETTINGS_SECTION_CLASS}>
      <div className="mb-4 flex flex-col gap-1.5">
        <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
        {description ? <p className="text-xs leading-5 text-stone-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function SettingsField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className={SETTINGS_FIELD_CLASS}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-stone-700">{label}</span>
        {hint ? <InfoTooltip content={hint} /> : null}
      </div>
      {children}
    </div>
  );
}

function ToggleField({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className={SETTINGS_FIELD_CLASS}>
      <div className="flex items-start justify-between gap-3">
        <label className="text-sm font-medium text-stone-700" htmlFor={id}>
          {label}
        </label>
        <div className="flex items-center gap-2">
          {hint ? <InfoTooltip content={hint} /> : null}
          <Checkbox id={id} checked={checked} onCheckedChange={(value) => onCheckedChange(Boolean(value))} />
        </div>
      </div>
    </div>
  );
}

function InfoTooltip({ content }: { content: string }) {
  return (
    <Tooltip content={content} contentClassName="max-w-[260px] whitespace-normal">
      <button
        type="button"
        className="inline-flex size-7 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 transition hover:border-stone-300 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300"
        aria-label={`查看${content.slice(0, 12)}说明`}
      >
        <CircleHelp className="size-3.5" />
      </button>
    </Tooltip>
  );
}
