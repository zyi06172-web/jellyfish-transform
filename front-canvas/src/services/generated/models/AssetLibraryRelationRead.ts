/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 资产库卡片关系边。
 */
export type AssetLibraryRelationRead = {
    /**
     * 关系类型
     */
    relation_type: string;
    /**
     * 目标资产类型
     */
    target_type: string;
    /**
     * 目标资产 ID
     */
    target_id: string;
    /**
     * 关系展示标签
     */
    label?: string;
};

