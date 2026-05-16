'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  Card,
  Tag,
  Typography,
  Tooltip,
  Empty,
  App,
  Select,
  Segmented,
} from 'antd';
import { Button } from '@/components/ui';
import {
  FlagOutlined,
  DislikeOutlined,
  ReloadOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { listBadcases, updateBadcaseStatus, getErrorMessage } from '@/api/http-client';
import type { BadcaseItem } from '@/api/http-client';
import { useUserContext } from '@/hooks/useUserContext';

const { Text, Paragraph } = Typography;

const COLUMNS = [
  { key: 'OPEN', title: '待处理', color: '#ff4d4f', bgColor: '#fff2f0' },
  { key: 'REVIEWED', title: '已复核', color: '#1677ff', bgColor: '#f0f5ff' },
  { key: 'RESOLVED', title: '已解决', color: '#52c41a', bgColor: '#f6ffed' },
  { key: 'DISMISSED', title: '已忽略', color: '#8c8c8c', bgColor: '#fafafa' },
];

const STATUS_LABEL: Record<string, string> = {
  OPEN: '待处理',
  REVIEWED: '已复核',
  RESOLVED: '已解决',
  DISMISSED: '已忽略',
};

const FEEDBACK_COLOR: Record<string, string> = {
  DISLIKE: '#ff4d4f',
  REPORT: '#faad14',
};

export default function BadcaseKanban() {
  const { message } = App.useApp();
  const { tenantId } = useUserContext();
  const [items, setItems] = useState<BadcaseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedbackTypeFilter, setFeedbackTypeFilter] = useState<string | undefined>();
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const fetchBadcases = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listBadcases({
        tenantId,
        feedbackType: feedbackTypeFilter,
        size: 200,
      });
      setItems(res.items);
    } catch (err) {
      message.error(getErrorMessage(err, '加载 Badcase 失败'));
    } finally {
      setLoading(false);
    }
  }, [tenantId, feedbackTypeFilter, message]);

  useEffect(() => {
    fetchBadcases();
  }, [fetchBadcases]);

  const handleDragStart = (e: React.DragEvent, item: BadcaseItem) => {
    e.dataTransfer.setData('text/plain', String(item.id));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, colKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(colKey);
  };

  const handleDragLeave = () => {
    setDragOverCol(null);
  };

  const handleDrop = async (e: React.DragEvent, colKey: string) => {
    e.preventDefault();
    setDragOverCol(null);
    const id = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!id) return;

    const item = items.find((i) => i.id === id);
    if (!item || item.status === colKey) return;

    // Optimistic update
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: colKey } : i)));

    try {
      await updateBadcaseStatus(id, colKey);
      message.success(`已移至「${STATUS_LABEL[colKey]}」`);
    } catch (err) {
      // Rollback
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: item.status } : i)));
      message.error(getErrorMessage(err, '状态更新失败'));
    }
  };

  const groupByStatus = (): Record<string, BadcaseItem[]> => {
    const groups: Record<string, BadcaseItem[]> = { OPEN: [], REVIEWED: [], RESOLVED: [], DISMISSED: [] };
    items.forEach((item) => {
      if (groups[item.status]) groups[item.status].push(item);
    });
    return groups;
  };

  const grouped = groupByStatus();

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <Select
          placeholder="反馈类型"
          allowClear
          style={{ width: 140 }}
          value={feedbackTypeFilter}
          onChange={setFeedbackTypeFilter}
          options={[
            { label: '点踩', value: 'DISLIKE' },
            { label: '报告', value: 'REPORT' },
          ]}
        />
        <Button
          variant="secondary"
          size="sm"
          icon={<ReloadOutlined />}
          onClick={fetchBadcases}
          loading={loading}
        >
          刷新
        </Button>
      </div>

      <div style={{ display: 'flex', gap: 16, overflowX: 'auto', minHeight: 400 }}>
        {COLUMNS.map((col) => {
          const colItems = grouped[col.key] || [];
          const isOver = dragOverCol === col.key;
          return (
            <div
              key={col.key}
              onDragOver={(e) => handleDragOver(e, col.key)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.key)}
              style={{
                flex: 1,
                minWidth: 220,
                background: isOver ? col.bgColor : '#f5f5f5',
                borderRadius: 8,
                padding: 12,
                transition: 'background 0.2s',
                border: isOver ? `2px dashed ${col.color}` : '2px solid transparent',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: col.color }} />
                <Text strong style={{ fontSize: 14 }}>{col.title}</Text>
                <Tag>{colItems.length}</Tag>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {colItems.map((item) => (
                  <Card
                    key={item.id}
                    size="small"
                    draggable
                    onDragStart={(e) => handleDragStart(e, item)}
                    style={{
                      cursor: 'grab',
                      borderLeft: `3px solid ${FEEDBACK_COLOR[item.feedbackType] || col.color}`,
                    }}
                    styles={{ body: { padding: '10px 12px' } }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      {item.feedbackType === 'DISLIKE' ? (
                        <DislikeOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />
                      ) : (
                        <FlagOutlined style={{ color: '#faad14', fontSize: 12 }} />
                      )}
                      <Text style={{ fontSize: 11, color: '#999' }}>
                        {dayjs(item.createdAt).format('MM-DD HH:mm')}
                      </Text>
                    </div>
                    <Tooltip title={item.queryText}>
                      <Paragraph
                        ellipsis={{ rows: 2 }}
                        style={{ fontSize: 13, marginBottom: 6, lineHeight: 1.4 }}
                      >
                        {item.queryText || '(无查询内容)'}
                      </Paragraph>
                    </Tooltip>
                    <Tooltip title={item.answer}>
                      <Paragraph
                        type="secondary"
                        ellipsis={{ rows: 2 }}
                        style={{ fontSize: 12, marginBottom: 6, lineHeight: 1.4 }}
                      >
                        {item.answer || '(无回答)'}
                      </Paragraph>
                    </Tooltip>
                    {item.reportReason && (
                      <Tag style={{ fontSize: 11 }}>{item.reportReason}</Tag>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <ArrowRightOutlined style={{ fontSize: 10, color: '#bbb' }} />
                      <Text style={{ fontSize: 10, color: '#bbb' }}>
                        {item.comment || '拖动以更改状态'}
                      </Text>
                    </div>
                  </Card>
                ))}
              </div>

              {colItems.length === 0 && (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="拖放至此列"
                  style={{ marginTop: 16 }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
