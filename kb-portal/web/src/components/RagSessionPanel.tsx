'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  List,
  Typography,
  Button,
  Popconfirm,
  Spin,
  App,
} from 'antd';
import {
  PlusOutlined,
  MessageOutlined,
  DeleteOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { listSessions, deleteSession, createSession } from '@/api/http-client';
import type { RagSessionSummary } from '@/api/http-client';
import dayjs from 'dayjs';

const { Text } = Typography;

const DEV_TENANT_ID = 'dev-tenant-001';
const DEV_USER_ID = 'current-user';

interface RagSessionPanelProps {
  activeSessionId: string | undefined;
  onSelectSession: (sessionId: string) => void;
  onNewSession: (sessionId: string) => void;
  refreshTrigger: number;
}

export default function RagSessionPanel({
  activeSessionId,
  onSelectSession,
  onNewSession,
  refreshTrigger,
}: RagSessionPanelProps) {
  const { message } = App.useApp();
  const [sessions, setSessions] = useState<RagSessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listSessions(DEV_TENANT_ID, DEV_USER_ID);
      setSessions(data);
    } catch {
      // silent fail on initial load
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions, refreshTrigger]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await createSession(DEV_TENANT_ID, DEV_USER_ID);
      onNewSession(res.sessionId);
      fetchSessions();
    } catch {
      message.error('创建会话失败');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (sessionId: string) => {
    try {
      await deleteSession(sessionId, DEV_TENANT_ID);
      message.success('已删除会话');
      fetchSessions();
      if (activeSessionId === sessionId) {
        handleCreate();
      }
    } catch {
      message.error('删除失败');
    }
  };

  if (collapsed) {
    return (
      <div className="rag-session-panel rag-session-panel--collapsed">
        <Button
          type="text"
          icon={<MenuUnfoldOutlined />}
          onClick={() => setCollapsed(false)}
          style={{ color: 'var(--color-secondary)' }}
        />
        <Button
          type="text"
          icon={<PlusOutlined />}
          onClick={handleCreate}
          loading={creating}
          style={{ color: 'var(--color-accent)' }}
        />
      </div>
    );
  }

  return (
    <div className="rag-session-panel">
      {/* Header */}
      <div className="rag-session-panel__header">
        <Text strong style={{ fontSize: 14, color: 'var(--color-foreground)' }}>
          对话历史
        </Text>
        <Button
          type="text"
          size="small"
          icon={<MenuFoldOutlined />}
          onClick={() => setCollapsed(true)}
          style={{ color: 'var(--color-secondary)' }}
        />
      </div>

      {/* New Chat Button */}
      <div className="rag-session-panel__action">
        <Button
          block
          icon={<PlusOutlined />}
          onClick={handleCreate}
          loading={creating}
          style={{
            borderRadius: 8,
            height: 36,
            borderColor: 'var(--color-accent)',
            color: 'var(--color-accent)',
          }}
        >
          新对话
        </Button>
      </div>

      {/* Session List */}
      <div className="rag-session-panel__list">
        <Spin spinning={loading}>
          <List
            dataSource={sessions}
            locale={{ emptyText: '暂无历史对话' }}
            renderItem={(item) => (
              <div
                onClick={() => onSelectSession(item.sessionId)}
                className={[
                  'rag-session-item',
                  activeSessionId === item.sessionId ? 'rag-session-item--active' : '',
                ].filter(Boolean).join(' ')}
              >
                <div className="rag-session-item__main">
                  <div className="rag-session-item__title">
                    <MessageOutlined style={{
                      fontSize: 13,
                      color: activeSessionId === item.sessionId
                        ? 'var(--color-accent)'
                        : 'var(--color-secondary)',
                      flexShrink: 0,
                    }} />
                    <Text
                      ellipsis
                      style={{
                        fontSize: 13,
                        color: 'var(--color-foreground)',
                        fontWeight: activeSessionId === item.sessionId ? 500 : 400,
                      }}
                    >
                      {item.title || '新对话'}
                    </Text>
                  </div>
                  <Popconfirm
                    title="确定删除此对话？"
                    onConfirm={(e) => {
                      e?.stopPropagation();
                      handleDelete(item.sessionId);
                    }}
                    onCancel={(e) => e?.stopPropagation()}
                    okText="确定"
                    cancelText="取消"
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={<DeleteOutlined style={{ fontSize: 12 }} />}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        color: 'var(--color-muted-foreground)',
                        flexShrink: 0,
                        opacity: 0.5,
                        transition: 'opacity 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '1';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '0.5';
                      }}
                    />
                  </Popconfirm>
                </div>
                <Text type="secondary" style={{ fontSize: 11, marginLeft: 21 }}>
                  {dayjs(item.updatedAt).format('MM/DD HH:mm')}
                </Text>
              </div>
            )}
          />
        </Spin>
      </div>
    </div>
  );
}
