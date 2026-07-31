/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AssetLibraryReferenceImageRead } from './AssetLibraryReferenceImageRead';
import type { AssetLibraryRelationRead } from './AssetLibraryRelationRead';
/**
 * 资产库单个资产。
 */
export type AssetLibraryItemRead = {
    /**
     * 资产 ID
     */
    id: string;
    /**
     * 资产类型：character/scene/prop
     */
    type: string;
    /**
     * 资产名称
     */
    name: string;
    /**
     * 资产描述
     */
    description?: string;
    /**
     * 角色圣经；非角色可为空
     */
    bible?: Record<string, any>;
    /**
     * 参考图列表
     */
    reference_images?: Array<AssetLibraryReferenceImageRead>;
    /**
     * 卡片关系
     */
    relations?: Array<AssetLibraryRelationRead>;
};

