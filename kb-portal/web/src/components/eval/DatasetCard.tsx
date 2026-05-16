'use client';

import React from 'react';
import { Card, Tag, Progress, Space, Typography, Button } from 'antd';
import {
  FileTextOutlined,
  DeleteOutlined,
  RightOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import type { EvalDatasetItem } from '@/api/http-client';

const { Text, Paragraph } = Typography;

const statusConfig: Record<string, { color: string; label: string }> = {
  DRAFT: { color: 'default', label: '草稿' },
  GENERATING: { color: 'processing', label: '生成中' },
  COMPLETED: { color: 'success', label: '已完成' },
  FAILED: { color: 'error', label: '失败' },
};

interface Props {
  dataset: EvalDatasetItem;
  onView: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function DatasetCard({ dataset, onView, onDelete }: Props) {
  const status = statusConfig[dataset.status] || { color: 'default', label: dataset.status };
  const progress = dataset.progress as Record<string, unknown> | undefined;
  const completedQa = (progress?.completedQa as number) || 0;
  const totalQa = (progress?.totalQa as number) || dataset.totalQaPairs || 0;
  const progressPercent = totalQa > 0 ? Math.round((completedQa / totalQa) * 100) : 0;

  return (
    <Card
      hoverable
      style={{ marginBottom: 12 }}
      onClick={() => onView(dataset.datasetId)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Space direction="vertical" size={4} style={{ flex: 1 }}>
          <Space>
            <ExperimentOutlined />
            <Text strong style={{ fontSize: 16 }}>{dataset.name}</Text>
            <Tag color={status.color}>{status.label}</Tag>
          </Space>
          {dataset.description && (
            <Paragraph type="secondary" ellipsis={{ rows: 1 }} style={{ marginBottom: 0 }}>
              {dataset.description}
            </Paragraph>
          )}
          <Space size={16} style={{ marginTop: 4 }}>
            <Text type="secondary">
              <FileTextOutlined /> {dataset.fileCount} 文件
            </Text>
            <Text type="secondary">{dataset.totalChunks} 分块</Text>
            <Text type="secondary">{dataset.totalQaPairs} QA对</Text>
            <Text type="secondary">{dataset.sourceType}</Text>
          </Space>
          {dataset.status === 'GENERATING' && (
            <div style={{ width: 300, marginTop: 8 }}>
              <Progress percent={progressPercent} size="small" />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {completedQa} / {totalQa}
              </Text>
            </div>
          )}
        </Space>
        <Space>
          <Button
            type="primary"
            icon={<RightOutlined />}
            onClick={(e) => { e.stopPropagation(); onView(dataset.datasetId); }}
          >
            查看
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(dataset.datasetId);
            }}
          />
        </Space>
      </div>
    </Card>
  );
}
