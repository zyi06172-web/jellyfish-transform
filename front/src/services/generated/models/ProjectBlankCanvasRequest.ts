/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 创建空白女娲画布，不触发首页 from-prompt 分析。
 */
export type ProjectBlankCanvasRequest = {
    /**
     * 画布名称
     */
    name?: string;
    /**
     * 客户端幂等键
     */
    idempotency_key: string;
    /**
     * 项目默认视频比例
     */
    default_video_ratio?: string;
};

