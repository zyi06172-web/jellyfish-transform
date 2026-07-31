/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AssetLibraryItemRead } from './AssetLibraryItemRead';
/**
 * 项目资产库读视图。
 */
export type ProjectAssetLibraryRead = {
    /**
     * 项目 ID
     */
    project_id: string;
    /**
     * 角色资产
     */
    characters?: Array<AssetLibraryItemRead>;
    /**
     * 场景资产
     */
    scenes?: Array<AssetLibraryItemRead>;
    /**
     * 道具资产
     */
    props?: Array<AssetLibraryItemRead>;
};

