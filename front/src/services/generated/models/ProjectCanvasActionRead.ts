/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 画布动作写入后的 Agent 状态。
 */
export type ProjectCanvasActionRead = {
    /**
     * 项目 ID
     */
    project_id: string;
    /**
     * Agent session ID
     */
    session_id: string;
    /**
     * 当前 Agent 阶段
     */
    stage: string;
    /**
     * 当前 Agent 状态
     */
    status: string;
    /**
     * 本次写入的产物 ID
     */
    artifact_id?: (string | null);
    /**
     * 是否已经排入付费生成任务
     */
    paid_call_enqueued?: boolean;
};

