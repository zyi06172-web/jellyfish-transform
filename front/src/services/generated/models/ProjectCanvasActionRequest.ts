/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ProjectCanvasActionRequest = {
    session_id: string;
    action: 'script_parsed' | 'assets_ready' | 'storyboard_ready' | 'shotlist_text_ready' | 'keyframe_render' | 'shotlist_render_ready' | 'video_generate';
    idempotency_key: string;
    confirmed_paid_cost?: boolean;
    model?: string;
    item_count?: number;
    estimated_cny?: (number | null);
    payload?: Record<string, any>;
};
