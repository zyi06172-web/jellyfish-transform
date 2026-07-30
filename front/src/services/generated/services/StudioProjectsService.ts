/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AgentTurnRequest } from '../models/AgentTurnRequest';
import type { ApiResponse_AgentTurnRead_ } from '../models/ApiResponse_AgentTurnRead_';
import type { ApiResponse_AgentWorkspaceSnapshotRead_ } from '../models/ApiResponse_AgentWorkspaceSnapshotRead_';
import type { ApiResponse_NoneType_ } from '../models/ApiResponse_NoneType_';
import type { ApiResponse_PaginatedData_ProjectRead__ } from '../models/ApiResponse_PaginatedData_ProjectRead__';
import type { ApiResponse_ProjectAssetLibraryRead_ } from '../models/ApiResponse_ProjectAssetLibraryRead_';
import type { ApiResponse_ProjectBlankCanvasRead_ } from '../models/ApiResponse_ProjectBlankCanvasRead_';
import type { ApiResponse_ProjectCanvasActionRead_ } from '../models/ApiResponse_ProjectCanvasActionRead_';
import type { ApiResponse_ProjectCanvasStateRead_ } from '../models/ApiResponse_ProjectCanvasStateRead_';
import type { ApiResponse_ProjectFromPromptRead_ } from '../models/ApiResponse_ProjectFromPromptRead_';
import type { ApiResponse_ProjectRead_ } from '../models/ApiResponse_ProjectRead_';
import type { ApiResponse_ProjectStyleOptionsRead_ } from '../models/ApiResponse_ProjectStyleOptionsRead_';
import type { ProjectBlankCanvasRequest } from '../models/ProjectBlankCanvasRequest';
import type { ProjectCanvasActionRequest } from '../models/ProjectCanvasActionRequest';
import type { ProjectCanvasStateUpdate } from '../models/ProjectCanvasStateUpdate';
import type { ProjectCreate } from '../models/ProjectCreate';
import type { ProjectFromPromptRequest } from '../models/ProjectFromPromptRequest';
import type { ProjectUpdate } from '../models/ProjectUpdate';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class StudioProjectsService {
    /**
     * 获取项目风格候选项
     * @returns ApiResponse_ProjectStyleOptionsRead_ Successful Response
     * @throws ApiError
     */
    public static getProjectStyleOptionsApiV1StudioProjectsStyleOptionsGet(): CancelablePromise<ApiResponse_ProjectStyleOptionsRead_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/projects/style-options',
        });
    }
    /**
     * 项目列表（分页）
     * @returns ApiResponse_PaginatedData_ProjectRead__ Successful Response
     * @throws ApiError
     */
    public static listProjectsApiV1StudioProjectsGet({
        q,
        order,
        isDesc = false,
        page = 1,
        pageSize = 10,
    }: {
        /**
         * 关键字，过滤 name/description
         */
        q?: (string | null),
        /**
         * 排序字段
         */
        order?: (string | null),
        /**
         * 是否倒序
         */
        isDesc?: boolean,
        page?: number,
        pageSize?: number,
    }): CancelablePromise<ApiResponse_PaginatedData_ProjectRead__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/projects',
            query: {
                'q': q,
                'order': order,
                'is_desc': isDesc,
                'page': page,
                'page_size': pageSize,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 创建项目
     * @returns ApiResponse_ProjectRead_ Successful Response
     * @throws ApiError
     */
    public static createProjectApiV1StudioProjectsPost({
        requestBody,
    }: {
        requestBody: ProjectCreate,
    }): CancelablePromise<ApiResponse_ProjectRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/projects',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 创建空白女娲画布并初始化 Agent 会话
     * 创建空白画布，让用户从画布内 AgentDock 贴剧本开始。
     * @returns ApiResponse_ProjectBlankCanvasRead_ Successful Response
     * @throws ApiError
     */
    public static createBlankCanvasProjectApiV1StudioProjectsBlankCanvasPost({
        requestBody,
    }: {
        requestBody: ProjectBlankCanvasRequest,
    }): CancelablePromise<ApiResponse_ProjectBlankCanvasRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/projects/blank-canvas',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 从首页提示词创建项目并启动剧情分析
     * @returns ApiResponse_ProjectFromPromptRead_ Successful Response
     * @throws ApiError
     */
    public static createProjectFromPromptApiV1StudioProjectsFromPromptPost({
        requestBody,
    }: {
        requestBody: ProjectFromPromptRequest,
    }): CancelablePromise<ApiResponse_ProjectFromPromptRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/projects/from-prompt',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 获取 Agent 工作台快照
     * @returns ApiResponse_AgentWorkspaceSnapshotRead_ Successful Response
     * @throws ApiError
     */
    public static getProjectWorkspaceApiV1StudioProjectsProjectIdWorkspaceGet({
        projectId,
    }: {
        projectId: string,
    }): CancelablePromise<ApiResponse_AgentWorkspaceSnapshotRead_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/projects/{project_id}/workspace',
            path: {
                'project_id': projectId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 提交 Agent 对话 turn
     * @returns ApiResponse_AgentTurnRead_ Successful Response
     * @throws ApiError
     */
    public static handleProjectAgentTurnApiV1StudioProjectsProjectIdAgentTurnsPost({
        projectId,
        requestBody,
    }: {
        projectId: string,
        requestBody: AgentTurnRequest,
    }): CancelablePromise<ApiResponse_AgentTurnRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/projects/{project_id}/agent/turns',
            path: {
                'project_id': projectId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 获取项目资产库
     * @returns ApiResponse_ProjectAssetLibraryRead_ Successful Response
     * @throws ApiError
     */
    public static getProjectAssetLibraryApiV1StudioProjectsProjectIdAssetLibraryGet({
        projectId,
    }: {
        projectId: string,
    }): CancelablePromise<ApiResponse_ProjectAssetLibraryRead_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/projects/{project_id}/asset-library',
            path: {
                'project_id': projectId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 记录第6批画布节点动作并推进 Agent 阶段
     * 把画布动作追加为 Agent 消息和 artifact；付费阶段必须带显式确认。
     * @returns ApiResponse_ProjectCanvasActionRead_ Successful Response
     * @throws ApiError
     */
    public static createProjectCanvasActionApiV1StudioProjectsProjectIdCanvasActionsPost({
        projectId,
        requestBody,
    }: {
        projectId: string,
        requestBody: ProjectCanvasActionRequest,
    }): CancelablePromise<ApiResponse_ProjectCanvasActionRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/projects/{project_id}/canvas-actions',
            path: {
                'project_id': projectId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 获取项目画布状态
     * 读取 React Flow 画布状态；没有保存记录时返回空画布默认值。
     * @returns ApiResponse_ProjectCanvasStateRead_ Successful Response
     * @throws ApiError
     */
    public static getProjectCanvasStateApiV1StudioProjectsProjectIdCanvasStateGet({
        projectId,
    }: {
        projectId: string,
    }): CancelablePromise<ApiResponse_ProjectCanvasStateRead_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/projects/{project_id}/canvas-state',
            path: {
                'project_id': projectId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 保存项目画布状态
     * 保存节点、连线与视口，让画布刷新后可恢复。
     * @returns ApiResponse_ProjectCanvasStateRead_ Successful Response
     * @throws ApiError
     */
    public static updateProjectCanvasStateApiV1StudioProjectsProjectIdCanvasStatePatch({
        projectId,
        requestBody,
    }: {
        projectId: string,
        requestBody: ProjectCanvasStateUpdate,
    }): CancelablePromise<ApiResponse_ProjectCanvasStateRead_> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/v1/studio/projects/{project_id}/canvas-state',
            path: {
                'project_id': projectId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 获取项目
     * @returns ApiResponse_ProjectRead_ Successful Response
     * @throws ApiError
     */
    public static getProjectApiV1StudioProjectsProjectIdGet({
        projectId,
    }: {
        projectId: string,
    }): CancelablePromise<ApiResponse_ProjectRead_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/projects/{project_id}',
            path: {
                'project_id': projectId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 更新项目
     * @returns ApiResponse_ProjectRead_ Successful Response
     * @throws ApiError
     */
    public static updateProjectApiV1StudioProjectsProjectIdPatch({
        projectId,
        requestBody,
    }: {
        projectId: string,
        requestBody: ProjectUpdate,
    }): CancelablePromise<ApiResponse_ProjectRead_> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/v1/studio/projects/{project_id}',
            path: {
                'project_id': projectId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 删除项目
     * @returns ApiResponse_NoneType_ Successful Response
     * @throws ApiError
     */
    public static deleteProjectApiV1StudioProjectsProjectIdDelete({
        projectId,
    }: {
        projectId: string,
    }): CancelablePromise<ApiResponse_NoneType_> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/v1/studio/projects/{project_id}',
            path: {
                'project_id': projectId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
}
