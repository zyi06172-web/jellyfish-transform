/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ProjectCanvasViewport } from './ProjectCanvasViewport';
/**
 * 章节画布持久化状态；一个章节就是一个剧集画布。
 */
export type ChapterCanvasStateRead = {
    /**
     * 章节/集 ID
     */
    chapter_id: string;
    /**
     * 项目/剧 ID
     */
    project_id: string;
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

