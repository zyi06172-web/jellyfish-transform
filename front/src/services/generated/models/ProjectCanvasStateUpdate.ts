/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ProjectCanvasViewport } from './ProjectCanvasViewport';
/**
 * 项目画布状态更新载荷。
 */
export type ProjectCanvasStateUpdate = {
    /**
     * React Flow 节点
     */
    nodes?: Array<Record<string, any>>;
    /**
     * React Flow 连线
     */
    edges?: Array<Record<string, any>>;
    /**
     * 画布视口
     */
    viewport?: ProjectCanvasViewport;
};

