'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Modal, Spin, App, Button, Space } from 'antd';
import { DownloadOutlined, ExpandOutlined, FileTextOutlined } from '@ant-design/icons';
import { getDocFile, getDocPreview } from '@/api/http-client';

interface FilePreviewProps {
  docId: string;
  version?: number;
  filename: string;
  open: boolean;
  onClose: () => void;
  /** 初始页码（PDF 定位用） */
  initialPage?: number;
  /** 高亮文本（PDF 搜索高亮用） */
  highlightText?: string;
}

type PreviewType = 'image' | 'pdf' | 'markdown' | 'text' | 'unsupported' | 'loading' | 'error';

const getPreviewType = (filename: string): PreviewType => {
  if (!filename) return 'text';
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') ||
      lower.endsWith('.gif') || lower.endsWith('.webp') || lower.endsWith('.svg')) {
    return 'image';
  }
  if (lower.endsWith('.pdf')) {
    return 'pdf';
  }
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return 'markdown';
  }
  if (lower.endsWith('.txt') || lower.endsWith('.log') || lower.endsWith('.json') ||
      lower.endsWith('.xml') || lower.endsWith('.html') || lower.endsWith('.css') ||
      lower.endsWith('.js') || lower.endsWith('.ts')) {
    return 'text';
  }
  return 'unsupported';
};

/**
 * 为 PDF URL 追加页码定位和高亮搜索参数。
 * Chrome/Edge 支持 #page=N 和 #search=text；Firefox 支持 #page=N。
 */
const buildPdfUrl = (baseUrl: string, page?: number, highlight?: string): string => {
  const parts: string[] = [];
  if (page && page > 0) {
    parts.push(`page=${page}`);
  }
  if (highlight && highlight.trim()) {
    // 取前 30 个字符避免 URL 过长，去除换行和多余空格
    const clean = highlight.trim().slice(0, 30).replace(/\s+/g, ' ');
    parts.push(`search=${encodeURIComponent(clean)}`);
  }
  if (parts.length === 0) return baseUrl;
  return `${baseUrl}#${parts.join('&')}`;
};

const FilePreview: React.FC<FilePreviewProps> = ({
  docId,
  version = 1,
  filename,
  open,
  onClose,
  initialPage,
  highlightText,
}) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<PreviewType>('loading');
  const [fullscreen, setFullscreen] = useState(false);
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!open || !docId) return;

    cancelledRef.current = false;

    const loadFile = async () => {
      setLoading(true);
      setPreviewType('loading');
      setBlobUrl(null);
      setPresignedUrl(null);

      try {
        const previewResp = await getDocPreview(docId, version, initialPage, highlightText);
        if (cancelledRef.current) return;

        if (previewResp.previewUrl) {
          setPresignedUrl(previewResp.previewUrl);
          setPreviewType((previewResp.previewType as PreviewType) || getPreviewType(filename) || 'unsupported');

          // blob 下载仅用于下载按钮，失败不影响预览
          try {
            const blob = await getDocFile(docId, version);
            if (!cancelledRef.current) {
              setBlobUrl(URL.createObjectURL(blob));
            }
          } catch (downloadErr) {
            console.warn('Blob download failed, download will use presigned URL:', downloadErr);
          }
        } else {
          // 无 presigned URL，降级为 blob 预览
          const blob = await getDocFile(docId, version);
          if (cancelledRef.current) return;
          setBlobUrl(URL.createObjectURL(blob));
          setPreviewType(getPreviewType(filename));
        }
      } catch (err) {
        if (cancelledRef.current) return;
        console.error('Failed to load file:', err);
        message.error('加载文件失败');
        setPreviewType('error');
      } finally {
        if (!cancelledRef.current) {
          setLoading(false);
        }
      }
    };

    loadFile();

    return () => {
      cancelledRef.current = true;
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [open, docId, version, filename, initialPage, highlightText]);

  const handleDownload = () => {
    // 优先使用 blobUrl，降级为 presignedUrl
    const downloadUrl = blobUrl || presignedUrl;
    if (!downloadUrl) return;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    a.target = '_blank';
    a.click();
  };

  const renderPreviewContent = () => {
    if (loading || previewType === 'loading') {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
          <Spin tip="正在加载文件..." />
        </div>
      );
    }

    if (previewType === 'error') {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: 'var(--color-destructive)' }}>
          加载文件失败
        </div>
      );
    }

    if (previewType === 'unsupported') {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: 'var(--color-secondary)' }}>
          <Space direction="vertical" align="center">
            <FileTextOutlined style={{ fontSize: 48 }} />
            <span>此文件格式暂不支持预览</span>
            <Button icon={<DownloadOutlined />} onClick={handleDownload}>
              下载文件
            </Button>
          </Space>
        </div>
      );
    }

    if (previewType === 'image' && presignedUrl) {
      return (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          overflow: 'auto',
          maxHeight: fullscreen ? '90vh' : '60vh',
          padding: 16,
        }}>
          <img
            src={presignedUrl}
            alt={filename}
            style={{
              maxWidth: '100%',
              maxHeight: fullscreen ? '85vh' : '55vh',
              objectFit: 'contain',
              borderRadius: 8,
            }}
          />
        </div>
      );
    }

    if (previewType === 'pdf' && presignedUrl) {
      const pdfUrl = buildPdfUrl(presignedUrl, initialPage, highlightText);
      return (
        <iframe
          src={pdfUrl}
          title={filename}
          style={{
            width: '100%',
            height: fullscreen ? '90vh' : '60vh',
            border: 'none',
            borderRadius: 8,
            background: 'var(--color-muted)',
          }}
        />
      );
    }

    if (previewType === 'markdown' && presignedUrl) {
      return (
        <iframe
          src={presignedUrl}
          title={filename}
          style={{
            width: '100%',
            height: fullscreen ? '90vh' : '60vh',
            border: 'none',
            borderRadius: 8,
            background: 'var(--color-surface)',
          }}
        />
      );
    }

    if (previewType === 'text' && presignedUrl) {
      return (
        <iframe
          src={presignedUrl}
          title={filename}
          style={{
            width: '100%',
            height: fullscreen ? '90vh' : '60vh',
            border: 'none',
            borderRadius: 8,
            background: 'var(--color-surface)',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 13,
          }}
        />
      );
    }

    // 降级：有 blobUrl 但没有 presignedUrl 时，用 blobUrl 渲染
    if (blobUrl && !presignedUrl) {
      return (
        <iframe
          src={blobUrl}
          title={filename}
          style={{
            width: '100%',
            height: fullscreen ? '90vh' : '60vh',
            border: 'none',
            borderRadius: 8,
          }}
        />
      );
    }

    return null;
  };

  const showDownload = !!(blobUrl || presignedUrl);

  return (
    <Modal
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{filename}</span>
          <Space>
            {showDownload && previewType !== 'error' && (
              <>
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={handleDownload}
                >
                  下载
                </Button>
                <Button
                  size="small"
                  icon={<ExpandOutlined />}
                  onClick={() => setFullscreen(!fullscreen)}
                >
                  {fullscreen ? '缩小' : '全屏'}
                </Button>
              </>
            )}
          </Space>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={fullscreen ? '95vw' : 800}
      style={{ top: fullscreen ? 20 : 100 }}
      bodyStyle={{ padding: 0, height: fullscreen ? '85vh' : '65vh', overflow: 'hidden' }}
      destroyOnClose
    >
      {renderPreviewContent()}
    </Modal>
  );
};

export default FilePreview;
