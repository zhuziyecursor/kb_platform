'use client';

import React from 'react';
import { Table, Tag, Space, Typography, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { EvalQaPairItem } from '@/api/http-client';

const { Text, Paragraph } = Typography;

const typeConfig: Record<string, { color: string; label: string }> = {
  FACTUAL: { color: 'blue', label: '事实型' },
  COMPARISON: { color: 'purple', label: '对比型' },
  MULTI_HOP: { color: 'orange', label: '多跳推理' },
  UNANSWERABLE: { color: 'red', label: '不可回答' },
};

const difficultyConfig: Record<string, { color: string; label: string }> = {
  EASY: { color: 'green', label: '简单' },
  MEDIUM: { color: 'gold', label: '中等' },
  HARD: { color: 'red', label: '困难' },
};

interface Props {
  dataSource: EvalQaPairItem[];
  loading?: boolean;
  pagination: { current: number; pageSize: number; total: number };
  onPageChange: (page: number, size: number) => void;
}

export default function QaPairTable({ dataSource, loading, pagination, onPageChange }: Props) {
  const columns: ColumnsType<EvalQaPairItem> = [
    {
      title: '问题',
      dataIndex: 'question',
      key: 'question',
      width: 300,
      render: (text: string) => (
        <Tooltip title={text}>
          <Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0, maxWidth: 300 }}>
            {text}
          </Paragraph>
        </Tooltip>
      ),
    },
    {
      title: '答案',
      dataIndex: 'answer',
      key: 'answer',
      render: (text: string) => (
        <Tooltip title={text}>
          <Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0, maxWidth: 400 }}>
            {text}
          </Paragraph>
        </Tooltip>
      ),
    },
    {
      title: '类型',
      dataIndex: 'qaType',
      key: 'qaType',
      width: 100,
      render: (type: string) => {
        const cfg = typeConfig[type] || { color: 'default', label: type };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '难度',
      dataIndex: 'difficulty',
      key: 'difficulty',
      width: 80,
      render: (d: string) => {
        const cfg = difficultyConfig[d] || { color: 'default', label: d };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '来源',
      dataIndex: 'sourceDocPath',
      key: 'sourceDocPath',
      width: 150,
      ellipsis: true,
      render: (path: string) => path ? path.split('/').pop() : '-',
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={dataSource}
      rowKey="pairId"
      loading={loading}
      pagination={{
        ...pagination,
        showSizeChanger: true,
        showTotal: (total) => `共 ${total} 条`,
        onChange: onPageChange,
      }}
      expandable={{
        expandedRowRender: (record) => (
          <div style={{ padding: '8px 0' }}>
            <Space direction="vertical" size={4}>
              <Text strong>完整答案:</Text>
              <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                {record.answer}
              </Paragraph>
              {record.sourceDocPath && (
                <Text type="secondary">来源文件: {record.sourceDocPath}</Text>
              )}
              {record.sourceChunkIds?.length > 0 && (
                <Text type="secondary">
                  关联分块: {record.sourceChunkIds.join(', ')}
                </Text>
              )}
            </Space>
          </div>
        ),
        rowExpandable: () => true,
      }}
      size="middle"
    />
  );
}
