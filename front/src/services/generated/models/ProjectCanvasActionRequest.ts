/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 画布节点动作请求；只通过显式确认入口触发付费阶段。
 */
export type ProjectCanvasActionRequest = {
    /**
     * Agent session ID
     */
    session_id: string;
    /**
     * 画布链路动作
     */
    action: 'script_parsed' | 'assets_ready' | 'storyboard_ready' | 'shotlist_text_ready' | 'keyframe_render' | 'shotlist_render_ready' | 'video_generate';
    /**
     * 客户端幂等键
     */
    idempotency_key: string;
    /**
     * 用户是否已确认付费成本闸门
     */
    confirmed_paid_cost?: boolean;
    /**
     * 本次动作使用的模型说明
     */
    model?: string;
    /**
     * 预计生成数量
     */
    item_count?: number;
    /**
     * 前端展示的预估费用
     */
    estimated_cny?: (number | null);
    /**
     * 画布节点结构化载荷
     */
    payload?: Record<string, any>;
};

