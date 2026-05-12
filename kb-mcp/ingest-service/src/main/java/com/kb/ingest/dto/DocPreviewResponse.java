package com.kb.ingest.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 文档预览响应，用于引用跳转原文场景。
 * <p>
 * 前端拿到 previewUrl 后，可根据文件类型选择渲染方式：
 * <ul>
 *   <li>PDF：iframe 嵌入，可通过 URL hash #page=N 定位页码，#search=text 高亮文本</li>
 *   <li>图片：img 标签直接展示</li>
 *   <li>文本/MD：iframe 或 pre 标签展示</li>
 * </ul>
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DocPreviewResponse {

    /** 文档ID */
    private String docId;

    /** 文档版本 */
    private int version;

    /** 文档标题（原始文件名） */
    private String title;

    /** MinIO presigned URL，可直接用于浏览器访问 */
    private String previewUrl;

    /** 预览类型：pdf / image / markdown / text / unsupported */
    private String previewType;

    /** 目标页码（来自引用），如为 null 则展示首页 */
    private Integer page;

    /** 高亮文本（来自引用），如为 null 则不高亮 */
    private String highlight;

    /** presigned URL 过期时间（秒） */
    private int expireIn;
}
