'use client';

import React, { useState, useMemo } from 'react';
import { Card, Typography, Upload, Tree, Progress, Alert, Result, Divider } from 'antd';
import { Button } from '@/components/ui';
import { App } from 'antd';
import {
  UploadOutlined,
  FileMarkdownOutlined,
  FolderOutlined,
  ArrowLeftOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import type { TreeDataNode } from 'antd';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import { createSpace } from '@/api/knowledge-space';
import type { CreateSpaceRequest } from '@/types';

const { Text, Title } = Typography;
const { Dragger } = Upload;

interface OutlineNode {
  name: string;
  level: number;
  children: OutlineNode[];
}

interface ImportError {
  name: string;
  error: string;
}

function parseMarkdownOutline(markdown: string): { title: string; nodes: OutlineNode[] } {
  const lines = markdown.split('\n');
  let title = '';
  const stack: { node: OutlineNode; level: number }[] = [];
  const roots: OutlineNode[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (!match) continue;

    const level = match[1].length;
    const name = match[2].trim();

    if (level === 1) {
      title = name;
      continue;
    }

    if (level > 4) continue;

    const node: OutlineNode = { name, level, children: [] };

    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].node.children.push(node);
    }

    stack.push({ node, level });
  }

  return { title, nodes: roots };
}

function countAllNodes(nodes: OutlineNode[]): number {
  let count = 0;
  for (const n of nodes) {
    count += 1 + countAllNodes(n.children);
  }
  return count;
}

function toTreeData(nodes: OutlineNode[]): TreeDataNode[] {
  return nodes.map((node, idx) => ({
    title: (
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <FolderOutlined style={{ color: '#3B82F6', fontSize: 14 }} />
        <span>{node.name}</span>
        {node.children.length > 0 && (
          <Text type="secondary" style={{ fontSize: 11 }}>
            ({countAllNodes(node.children)} 个子分类)
          </Text>
        )}
      </span>
    ),
    key: `${node.name}-${idx}`,
    children: toTreeData(node.children),
  }));
}

async function batchCreateSpaces(
  nodes: OutlineNode[],
  parentId: string | undefined,
  onProgress: (current: number, total: number) => void,
): Promise<{ created: number; failed: number; errors: ImportError[] }> {
  const total = countAllNodes(nodes);
  let completed = 0;
  const errors: ImportError[] = [];
  let created = 0;
  let failed = 0;

  async function process(ns: OutlineNode[], pid: string | undefined) {
    for (const node of ns) {
      const payload: CreateSpaceRequest = { name: node.name };
      if (pid) payload.parentId = pid;

      try {
        const space = await createSpace(payload);
        created++;
        if (node.children.length > 0) {
          await process(node.children, space.id);
        }
      } catch (e: any) {
        failed++;
        errors.push({ name: node.name, error: e?.message || '未知错误' });
      }
      completed++;
      onProgress(completed, total);
    }
  }

  await process(nodes, parentId);
  return { created, failed, errors };
}

type Step = 'upload' | 'preview' | 'importing' | 'done';

export default function ImportOutlinePage() {
  const { message: msg } = App.useApp();
  const router = useRouter();

  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState<string>('');
  const [outlineTitle, setOutlineTitle] = useState('');
  const [outlineNodes, setOutlineNodes] = useState<OutlineNode[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<{ created: number; failed: number; errors: ImportError[] } | null>(null);

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.md')) {
      msg.error('请上传 .md 格式的 Markdown 文件');
      return false;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content.trim()) {
        msg.error('文件内容为空');
        return;
      }

      const { title, nodes } = parseMarkdownOutline(content);

      if (nodes.length === 0) {
        msg.error('未检测到有效的标题结构（## / ### / ####），请检查文件格式');
        return;
      }

      setFileName(file.name);
      setOutlineTitle(title);
      setOutlineNodes(nodes);
      setStep('preview');
    };
    reader.onerror = () => {
      msg.error('文件读取失败，请重试');
    };
    reader.readAsText(file, 'UTF-8');
    return false; // prevent actual upload
  };

  const handleImport = async () => {
    setStep('importing');
    setProgress({ current: 0, total: 0 });

    const res = await batchCreateSpaces(outlineNodes, undefined, (current, total) => {
      setProgress({ current, total });
    });

    setResult(res);
    setStep('done');
  };

  const handleReset = () => {
    setStep('upload');
    setFileName('');
    setOutlineTitle('');
    setOutlineNodes([]);
    setProgress({ current: 0, total: 0 });
    setResult(null);
  };

  const totalSpaces = useMemo(() => countAllNodes(outlineNodes), [outlineNodes]);
  const treeData = useMemo(() => toTreeData(outlineNodes), [outlineNodes]);

  const renderUpload = () => (
    <Card style={{ borderRadius: 12 }}>
      <Dragger
        accept=".md"
        maxCount={1}
        showUploadList={false}
        beforeUpload={handleFile as any}
        style={{ padding: '48px 0' }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>
          点击或拖拽 Markdown 大纲文件到此区域
        </p>
        <p style={{ color: '#94A3B8', fontSize: 13 }}>
          支持 .md 文件，解析标题层级（## / ### / ####）自动生成知识空间结构
        </p>
      </Dragger>

      <Divider />

      <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '16px 20px' }}>
        <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>格式示例：</Text>
        <pre style={{
          background: '#1E293B',
          color: '#E2E8F0',
          borderRadius: 8,
          padding: '14px 18px',
          fontSize: 12,
          lineHeight: 1.8,
          margin: 0,
          overflow: 'auto',
        }}>
{`# 知识库大纲
## 审计问题定性库
### 战略规划与执行
#### 国家政策
### 财务管理
## 法律法规库
### 国家级`}
        </pre>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 10 }}>
          # 可选，作为分组标题；## 为一级空间；### 为二级空间；#### 为三级空间；普通文本自动忽略
        </Text>
      </div>
    </Card>
  );

  const renderPreview = () => (
    <Card style={{ borderRadius: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <FileMarkdownOutlined style={{ fontSize: 22, color: '#3B82F6' }} />
            <Text strong style={{ fontSize: 16 }}>{fileName}</Text>
          </div>
          {outlineTitle && (
            <Text type="secondary" style={{ fontSize: 13 }}>
              大纲标题：{outlineTitle}
            </Text>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <Text type="secondary" style={{ fontSize: 13, display: 'block' }}>
            将创建
          </Text>
          <Text strong style={{ fontSize: 28, color: '#3B82F6' }}>
            {totalSpaces}
          </Text>
          <Text type="secondary" style={{ fontSize: 13 }}>
            个知识空间
          </Text>
        </div>
      </div>

      <Alert
        message={`确认导入后将按层级顺序依次创建 ${totalSpaces} 个知识空间，请仔细核对树形结构。`}
        type="info"
        showIcon
        style={{ marginBottom: 20, borderRadius: 8 }}
      />

      <div style={{
        maxHeight: 400,
        overflow: 'auto',
        border: '1px solid #E2E8F0',
        borderRadius: 10,
        padding: '12px 16px',
        background: '#FAFBFC',
        marginBottom: 20,
      }}>
        {treeData.length > 0 ? (
          <Tree
            treeData={treeData}
            defaultExpandAll
            showLine={{ showLeafIcon: false }}
            style={{ background: 'transparent' }}
          />
        ) : (
          <Text type="secondary">无有效节点</Text>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <Button variant="outline" onClick={handleReset}>
          重新选择文件
        </Button>
        <Button variant="primary" onClick={handleImport}>
          确认导入
        </Button>
      </div>
    </Card>
  );

  const renderImporting = () => (
    <Card style={{ borderRadius: 12 }}>
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <Title level={4} style={{ marginBottom: 24 }}>
          正在创建知识空间...
        </Title>
        <Progress
          type="circle"
          percent={progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}
          format={() => `${progress.current}/${progress.total}`}
          size={160}
        />
        <Text type="secondary" style={{ display: 'block', marginTop: 20, fontSize: 13 }}>
          已完成 {progress.current} / {progress.total} 个空间，请勿关闭页面
        </Text>
      </div>
    </Card>
  );

  const renderDone = () => {
    if (!result) return null;
    const allSuccess = result.failed === 0;

    return (
      <Card style={{ borderRadius: 12 }}>
        <Result
          status={allSuccess ? 'success' : result.created > 0 ? 'warning' : 'error'}
          title={
            allSuccess
              ? `成功创建 ${result.created} 个知识空间`
              : `创建完成：成功 ${result.created} 个，失败 ${result.failed} 个`
          }
          subTitle="知识空间已按大纲层级关系创建，可返回列表查看。"
        />

        {result.errors.length > 0 && (
          <div style={{
            background: '#FFF7ED',
            border: '1px solid #FED7AA',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 20,
            maxHeight: 200,
            overflow: 'auto',
          }}>
            <Text strong style={{ color: '#C2410C', fontSize: 13, display: 'block', marginBottom: 8 }}>
              以下空间创建失败：
            </Text>
            {result.errors.map((e, i) => (
              <div key={i} style={{ fontSize: 12, color: '#9A3412', marginBottom: 4 }}>
                <Text type="secondary">{e.name}</Text> — {e.error}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Button variant="outline" onClick={handleReset}>
            导入更多
          </Button>
          <Button variant="primary" onClick={() => router.push('/spaces/list')}>
            返回空间列表
          </Button>
        </div>
      </Card>
    );
  };

  return (
    <AppLayout>
      <PageHeader
        breadcrumbs={[
          { title: '知识库', href: '/spaces/list' },
          { title: '知识空间', href: '/spaces/list' },
          { title: '从大纲导入' },
        ]}
        title="从 Markdown 大纲导入空间结构"
        description="上传 Markdown 文件，自动解析标题层级并批量创建知识空间树"
        actions={
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => router.push('/spaces/list')}
          >
            返回列表
          </Button>
        }
      />

      {step === 'upload' && renderUpload()}
      {step === 'preview' && renderPreview()}
      {step === 'importing' && renderImporting()}
      {step === 'done' && renderDone()}
    </AppLayout>
  );
}
