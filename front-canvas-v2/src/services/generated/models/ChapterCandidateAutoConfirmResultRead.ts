/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ShotCandidateAutoConfirmResultRead } from './ShotCandidateAutoConfirmResultRead';
/**
 * 章节级候选自动确认结果。
 */
export type ChapterCandidateAutoConfirmResultRead = {
    /**
     * 章节 ID
     */
    chapter_id: string;
    /**
     * 执行级别
     */
    level: 'L1' | 'L2' | 'L3';
    /**
     * 处理镜头数
     */
    shot_count?: number;
    /**
     * 关联已有资产数量
     */
    linked_existing?: number;
    /**
     * 创建并关联资产数量
     */
    created_and_linked?: number;
    /**
     * 跳过候选数量
     */
    skipped?: number;
    /**
     * 逐镜头结果
     */
    results?: Array<ShotCandidateAutoConfirmResultRead>;
};

