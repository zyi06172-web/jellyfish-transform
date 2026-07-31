/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 模型与供应商诊断结果，使用 ok/warning/error 三态表达真实就绪度。
 */
export type LlmDiagnosticRead = {
    /**
     * 诊断状态：ok/warning/error
     */
    status: string;
    /**
     * 面向用户的诊断摘要
     */
    message: string;
    /**
     * 本次诊断访问的脱敏 URL
     */
    checked_url?: (string | null);
    /**
     * 供应商稳定键
     */
    provider?: (string | null);
    /**
     * 被诊断的模型 ID
     */
    model_id?: (string | null);
    /**
     * 真实探测耗时（毫秒）
     */
    elapsed_ms?: (number | null);
    /**
     * 供应商返回的原始错误摘要
     */
    raw_error?: null;
};

