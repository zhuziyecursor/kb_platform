'use client';

import React, { useState, useCallback } from 'react';
import {
  Button,
  Card,
  Empty,
  Select,
  Space,
  Tag,
  Typography,
  Upload,
  App,
} from 'antd';
import {
  ArrowLeftOutlined,
  FileTextOutlined,
  InboxOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import type { UploadFile } from 'antd';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { diffLines, diffWords, type Change } from 'diff';

const { Title, Text } = Typography;
const { Dragger } = Upload;

type DiffMode = 'unified' | 'side-by-side';
type DiffGranularity = 'lines' | 'words';

const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.json', '.xml', '.csv', '.log', '.html', '.css', '.js', '.ts', '.jsx', '.tsx', '.yaml', '.yml', '.sql', '.py', '.java', '.go', '.rs', '.c', '.cpp', '.h'];

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsText(file);
  });
}

function computeDiff(text1: string, text2: string, granularity: DiffGranularity): Change[] {
  if (granularity === 'words') {
    return diffWords(text1, text2);
  }
  return diffLines(text1, text2);
}

function renderUnifiedDiff(changes: Change[], leftLabel: string, rightLabel: string) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono, "SF Mono", "Fira Code", "Cascadia Code", monospace)',
        fontSize: 13,
        lineHeight: 1.7,
        background: 'var(--color-muted)',
        borderRadius: 8,
        overflow: 'auto',
        maxHeight: 'calc(100vh - 380px)',
        border: '1px solid var(--border-color, #e5e7eb)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '8px 16px',
          background: 'var(--color-bg-elevated, #fafafa)',
          borderBottom: '1px solid var(--border-color, #e5e7eb)',
          fontSize: 12,
          color: 'var(--color-secondary)',
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }}
      >
        <span>{leftLabel} → {rightLabel}</span>
        <span>
          <Tag color="red" style={{ marginRight: 4 }}>- 删除</Tag>
          <Tag color="green">+ 新增</Tag>
        </span>
      </div>
      <div style={{ padding: '0 16px 16px' }}>
        {changes.map((change, i) => {
          const bg = change.added
            ? 'rgba(34, 197, 94, 0.1)'
            : change.removed
              ? 'rgba(239, 68, 68, 0.1)'
              : 'transparent';
          const prefix = change.added ? '+ ' : change.removed ? '- ' : '  ';
          const color = change.added ? 'var(--color-success, #16a34a)' : change.removed ? 'var(--color-danger, #dc2626)' : 'inherit';
          return (
            <div
              key={i}
              style={{
                background: bg,
                color,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                padding: '1px 0',
              }}
            >
              {prefix}{change.value}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderSideBySideDiff(changes: Change[], leftLabel: string, rightLabel: string) {
  const leftLines: { text: string; type: 'unchanged' | 'removed' | 'placeholder' }[] = [];
  const rightLines: { text: string; type: 'unchanged' | 'added' | 'placeholder' }[] = [];

  for (const change of changes) {
    if (change.added) {
      leftLines.push({ text: '', type: 'placeholder' });
      rightLines.push({ text: change.value, type: 'added' });
    } else if (change.removed) {
      leftLines.push({ text: change.value, type: 'removed' });
      rightLines.push({ text: '', type: 'placeholder' });
    } else {
      const unchangedLines = change.value.split('\n');
      // Last element is empty string if value ends with \n
      const lines = change.value.endsWith('\n')
        ? unchangedLines.slice(0, -1)
        : unchangedLines;
      for (const line of lines) {
        leftLines.push({ text: line, type: 'unchanged' });
        rightLines.push({ text: line, type: 'unchanged' });
      }
    }
  }

  const maxLen = Math.max(leftLines.length, rightLines.length);

  return (
    <div
      style={{
        fontFamily: 'var(--font-mono, "SF Mono", "Fira Code", "Cascadia Code", monospace)',
        fontSize: 13,
        lineHeight: 1.7,
        borderRadius: 8,
        overflow: 'auto',
        maxHeight: 'calc(100vh - 380px)',
        border: '1px solid var(--border-color, #e5e7eb)',
      }}
    >
      <div
        style={{
          display: 'flex',
          position: 'sticky',
          top: 0,
          zIndex: 1,
          background: 'var(--color-bg-elevated, #fafafa)',
          borderBottom: '1px solid var(--border-color, #e5e7eb)',
        }}
      >
        <div style={{ flex: 1, padding: '8px 16px', fontSize: 12, color: 'var(--color-secondary)', borderRight: '1px solid var(--border-color, #e5e7eb)' }}>
          {leftLabel}
        </div>
        <div style={{ flex: 1, padding: '8px 16px', fontSize: 12, color: 'var(--color-secondary)' }}>
          {rightLabel}
        </div>
      </div>
      <div style={{ display: 'flex' }}>
        <div style={{ flex: 1, borderRight: '1px solid var(--border-color, #e5e7eb)', minWidth: 0 }}>
          {leftLines.slice(0, maxLen).map((line, i) => (
            <div
              key={i}
              style={{
                padding: '1px 8px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                background: line.type === 'removed' ? 'rgba(239, 68, 68, 0.1)' : line.type === 'placeholder' ? 'var(--color-muted)' : 'transparent',
                color: line.type === 'removed' ? 'var(--color-danger, #dc2626)' : 'inherit',
                minHeight: 22,
              }}
            >
              {line.type === 'removed' ? '- ' : '  '}{line.text}
            </div>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {rightLines.slice(0, maxLen).map((line, i) => (
            <div
              key={i}
              style={{
                padding: '1px 8px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                background: line.type === 'added' ? 'rgba(34, 197, 94, 0.1)' : line.type === 'placeholder' ? 'var(--color-muted)' : 'transparent',
                color: line.type === 'added' ? 'var(--color-success, #16a34a)' : 'inherit',
                minHeight: 22,
              }}
            >
              {line.type === 'added' ? '+ ' : '  '}{line.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function FileComparePage() {
  const router = useRouter();
  const { message } = App.useApp();

  const [file1, setFile1] = useState<UploadFile | null>(null);
  const [file2, setFile2] = useState<UploadFile | null>(null);
  const [content1, setContent1] = useState<string>('');
  const [content2, setContent2] = useState<string>('');
  const [diffMode, setDiffMode] = useState<DiffMode>('side-by-side');
  const [granularity, setGranularity] = useState<DiffGranularity>('lines');

  const handleFile1 = useCallback(async (file: File) => {
    try {
      setFile1({ uid: '-1', name: file.name, status: 'done' });
      const text = await readFileAsText(file);
      setContent1(text);
    } catch {
      message.error('读取文件1失败');
    }
  }, [message]);

  const handleFile2 = useCallback(async (file: File) => {
    try {
      setFile2({ uid: '-2', name: file.name, status: 'done' });
      const text = await readFileAsText(file);
      setContent2(text);
    } catch {
      message.error('读取文件2失败');
    }
  }, [message]);

  const diffs = content1 && content2 ? computeDiff(content1, content2, granularity) : null;
  const hasDiff = diffs && diffs.some((c) => c.added || c.removed);

  const uploadProps1 = {
    accept: SUPPORTED_EXTENSIONS.join(','),
    maxCount: 1,
    showUploadList: true,
    beforeUpload: (file: File) => {
      handleFile1(file);
      return false;
    },
    onChange: (info: { file: UploadFile }) => {
      if (info.file.status === 'removed') {
        setFile1(null);
        setContent1('');
      }
    },
  };

  const uploadProps2 = {
    accept: SUPPORTED_EXTENSIONS.join(','),
    maxCount: 1,
    showUploadList: true,
    beforeUpload: (file: File) => {
      handleFile2(file);
      return false;
    },
    onChange: (info: { file: UploadFile }) => {
      if (info.file.status === 'removed') {
        setFile2(null);
        setContent2('');
      }
    },
  };

  return (
    <AppLayout>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => router.push('/skills')}
          >
            返回技能中心
          </Button>
          <Title level={4} style={{ margin: 0 }}>文件对比</Title>
          <Tag color="blue">工具箱</Tag>
        </div>

        {/* Upload Area */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, marginBottom: 20, alignItems: 'stretch' }}>
          <Card
            styles={{ body: { padding: 16 } }}
            style={{ borderRadius: 8 }}
          >
            <Dragger
              {...uploadProps1}
              style={{ background: file1 ? 'var(--color-bg-elevated, #fafafa)' : undefined }}
            >
              {file1 ? (
                <div style={{ padding: 8 }}>
                  <FileTextOutlined style={{ fontSize: 28, color: 'var(--color-primary, #1677ff)', marginBottom: 8 }} />
                  <div><Text strong>{file1.name}</Text></div>
                  <Text type="secondary" style={{ fontSize: 12 }}>点击或拖拽替换文件</Text>
                </div>
              ) : (
                <div style={{ padding: 8 }}>
                  <InboxOutlined style={{ fontSize: 28, color: 'var(--color-secondary)' }} />
                  <p style={{ margin: '8px 0 0', color: 'var(--color-secondary)' }}>上传文件1 (原始版本)</p>
                </div>
              )}
            </Dragger>
          </Card>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <SwapOutlined style={{ fontSize: 20, color: 'var(--color-secondary)' }} />
          </div>

          <Card
            styles={{ body: { padding: 16 } }}
            style={{ borderRadius: 8 }}
          >
            <Dragger
              {...uploadProps2}
              style={{ background: file2 ? 'var(--color-bg-elevated, #fafafa)' : undefined }}
            >
              {file2 ? (
                <div style={{ padding: 8 }}>
                  <FileTextOutlined style={{ fontSize: 28, color: 'var(--color-primary, #1677ff)', marginBottom: 8 }} />
                  <div><Text strong>{file2.name}</Text></div>
                  <Text type="secondary" style={{ fontSize: 12 }}>点击或拖拽替换文件</Text>
                </div>
              ) : (
                <div style={{ padding: 8 }}>
                  <InboxOutlined style={{ fontSize: 28, color: 'var(--color-secondary)' }} />
                  <p style={{ margin: '8px 0 0', color: 'var(--color-secondary)' }}>上传文件2 (新版本)</p>
                </div>
              )}
            </Dragger>
          </Card>
        </div>

        {/* Controls */}
        {file1 && file2 && (
          <Card styles={{ body: { padding: 12 } }} style={{ marginBottom: 16, borderRadius: 8 }}>
            <Space size={12}>
              <Select
                value={diffMode}
                onChange={setDiffMode}
                style={{ width: 130 }}
                options={[
                  { label: '并排对比', value: 'side-by-side' },
                  { label: '统一视图', value: 'unified' },
                ]}
              />
              <Select
                value={granularity}
                onChange={setGranularity}
                style={{ width: 110 }}
                options={[
                  { label: '按行比较', value: 'lines' },
                  { label: '按词比较', value: 'words' },
                ]}
              />
            </Space>
          </Card>
        )}

        {/* Diff Result */}
        {diffs && (
          <Card styles={{ body: { padding: 16 } }} style={{ borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Space>
                <Text strong>对比结果</Text>
                {hasDiff ? (
                  <Tag color="orange">有差异</Tag>
                ) : (
                  <Tag color="green">内容相同</Tag>
                )}
              </Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {file1?.name} ↔ {file2?.name}
              </Text>
            </div>
            {hasDiff ? (
              diffMode === 'unified'
                ? renderUnifiedDiff(diffs, file1?.name || '文件1', file2?.name || '文件2')
                : renderSideBySideDiff(diffs, file1?.name || '文件1', file2?.name || '文件2')
            ) : (
              <Empty description="两个文件内容完全相同" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        )}

        {/* Empty state when no files */}
        {!file1 && !file2 && (
          <Card styles={{ body: { padding: 48 } }} style={{ borderRadius: 8 }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <div>
                  <Text type="secondary">上传两个文件开始对比</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    支持 {SUPPORTED_EXTENSIONS.join(' / ')} 等文本文件
                  </Text>
                </div>
              }
            />
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
