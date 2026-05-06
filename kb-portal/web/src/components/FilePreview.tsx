'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Spin, App, Button, Space } from 'antd';
import { DownloadOutlined, ExpandOutlined, FileTextOutlined } from '@ant-design/icons';
import { getDocFile } from '@/api/http-client';

interface FilePreviewProps {
  docId: string;
  version?: number;
  filename: string;
  open: boolean;
  onClose: () => void;
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

const FilePreview: React.FC<FilePreviewProps> = ({
  docId,
  version = 1,
  filename,
  open,
  onClose,
}) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<PreviewType>('loading');
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!open || !docId) return;

    const loadFile = async () => {
      setLoading(true);
      setPreviewType('loading');

      try {
        const blob = await getDocFile(docId, version);
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setPreviewType(getPreviewType(filename));
      } catch (err) {
        console.error('Failed to load file:', err);
        message.error('加载文件失败');
        setPreviewType('error');
      } finally {
        setLoading(false);
      }
    };

    loadFile();

    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [open, docId, version, filename]);

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
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

    if (previewType === 'image' && blobUrl) {
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
            src={blobUrl}
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

    if (previewType === 'pdf' && blobUrl) {
      return (
        <iframe
          src={blobUrl}
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

    if (previewType === 'markdown' && blobUrl) {
      return (
        <iframe
          srcDoc={`<!DOCTYPE html><html><head>
            <meta charset="utf-8">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                     padding: 20px; max-width: 900px; margin: 0 auto; line-height: 1.6; }
              pre { background: #f5f5f5; padding: 16px; border-radius: 8px; overflow-x: auto; }
              code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; }
            </style>
          </head><body><pre id="content"></pre></body></html>`}
          style={{
            width: '100%',
            height: fullscreen ? '90vh' : '60vh',
            border: 'none',
            borderRadius: 8,
          }}
        />
      );
    }

    if (previewType === 'text' && blobUrl) {
      return (
        <iframe
          src={blobUrl}
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

    return null;
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{filename}</span>
          <Space>
            {blobUrl && previewType !== 'error' && (
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
