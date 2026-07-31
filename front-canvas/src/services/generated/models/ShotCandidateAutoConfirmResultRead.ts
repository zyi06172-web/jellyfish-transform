/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ShotPreparationStateRead } from './ShotPreparationStateRead';
/**
 * 候选自动确认结果。
 */
export type ShotCandidateAutoConfirmResultRead = {
    /**
     * 镜头 ID
     */
    shot_id: string;
    /**
     * 执行级别
     */
    level: 'L1' | 'L2' | 'L3';
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
     * 已处理候选 ID
     */
    processed_candidate_ids?: Array<number>;
    /**
     * 执行说明
     */
    messages?: Array<string>;
    /**
     * 执行后的镜头准备状态
     */
    state: ShotPreparationStateRead;
};

