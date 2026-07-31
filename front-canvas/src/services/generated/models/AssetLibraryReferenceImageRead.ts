/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 资产库参考图。
 */
export type AssetLibraryReferenceImageRead = {
    /**
     * 资产图片行 ID
     */
    image_id: number;
    /**
     * 文件 ID
     */
    file_id: string;
    /**
     * 下载 URL
     */
    url: string;
    /**
     * 视角
     */
    view_angle: string;
    /**
     * 质量等级
     */
    quality_level: string;
    /**
     * 是否主图
     */
    is_primary?: boolean;
};

