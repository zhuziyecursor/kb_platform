'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  Select,
  Slider,
  Button as AntButton,
  Typography,
  Space,
  App,
  Divider,
  Tag,
  Switch,
  Skeleton,
} from 'antd';
import {
  CloudUploadOutlined,
  FolderOutlined,
  ThunderboltOutlined,
  EyeOutlined,
  TeamOutlined,
  FileTextOutlined,
  CalendarOutlined,
  SaveOutlined,
  CloseOutlined,
  EditOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { useRouter, useParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui';
import { getSpace, updateSpace } from '@/api/knowledge-space';
import type { KnowledgeSpace } from '@/types';

const { Title, Text } = Typography;

const CHUNK_MODE_MAP: Record<string, string> = {
  HEAD_FIRST: '从前到后',
  TAIL_FIRST: '从后到前',
  UNIFORM: '均匀切分',
  SMART: '智能切分',
  SMART_LLM: '智能+LLM',
};

const VISIBILITY_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PUBLIC: { label: '公开', color: 'green', icon: <EyeOutlined /> },
  TEAM: { label: '团队内', color: 'blue', icon: <TeamOutlined /> },
};

export default function SpaceDetailPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const params = useParams();
  const spaceId = params.id as string;
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [space, setSpace] = useState<KnowledgeSpace | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (spaceId === 'DEFAULT') {
      message.error('默认空间无法编辑');
      router.push('/spaces');
      return;
    }
    getSpace(spaceId)
      .then((data) => {
        setSpace(data);
        form.setFieldsValue({
          name: data.name,
          description: data.description,
          chunkSize: data.chunkSize,
          overlapRatio: data.overlapRatio,
          chunkMode: data.chunkMode,
          visibility: data.visibility,
          smartParseEnabled: data.smartParseEnabled,
        });
      })
      .catch(() => message.error('加载失败'));
  }, [spaceId]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await updateSpace(spaceId, values);
      message.success('知识空间更新成功');
      setIsEditing(false);
      router.push('/spaces');
    } catch {
      message.error('更新失败');
    } finally {
      setLoading(false);
    }
  };

  if (!space) {
    return (
      <AppLayout>
        <div className="space-detail-page">
          <div className="space-detail-page__left">
            <Skeleton active avatar={{ size: 80, shape: 'square' }} paragraph={{ rows: 4 }} />
          </div>
          <div className="space-detail-page__right">
            <Skeleton active paragraph={{ rows: 8 }} />
          </div>
        </div>
      </AppLayout>
    );
  }

  const visibility = VISIBILITY_MAP[space.visibility];

  return (
    <AppLayout>
      <PageHeader
        breadcrumbs={[
          { title: '知识库', href: '/spaces' },
          { title: '知识空间' },
        ]}
        title="空间详情"
        actions={
          <>
            {!isEditing ? (
              <>
                <Button
                  icon={<ArrowLeftOutlined />}
                  onClick={() => router.push('/spaces')}
                >
                  返回
                </Button>
                <Button
                  icon={<CloudUploadOutlined />}
                  onClick={() => router.push('/documents/upload')}
                >
                  上传文档
                </Button>
                <Button
                  variant="primary"
                  icon={<EditOutlined />}
                  onClick={() => setIsEditing(true)}
                >
                  编辑空间
                </Button>
              </>
            ) : (
              <>
                <Button
                  icon={<CloseOutlined />}
                  onClick={() => setIsEditing(false)}
                >
                  取消
                </Button>
                <Button
                  variant="primary"
                  icon={<SaveOutlined />}
                  onClick={handleSubmit}
                  loading={loading}
                >
                  保存
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="space-detail-page">
        {/* 左侧：空间元信息 */}
        <div className="space-detail-page__left">
          <div className="space-meta-card">
            <div className={`space-meta-card__icon ${space.id === 'DEFAULT' ? 'space-meta-card__icon--default' : ''}`}>
              <FolderOutlined style={{ fontSize: 32, color: 'currentColor' }} />
            </div>

            <Title level={3} style={{ margin: '16px 0 8px', fontSize: 22, fontWeight: 600 }}>
              {space.name}
            </Title>

            {space.description ? (
              <Text type="secondary" style={{ fontSize: 14, lineHeight: 1.6, display: 'block', marginBottom: 20 }}>
                {space.description}
              </Text>
            ) : (
              <Text type="secondary" style={{ fontSize: 14, display: 'block', marginBottom: 20, fontStyle: 'italic' }}>
                暂无描述
              </Text>
            )}

            <Divider style={{ margin: '16px 0' }} />

            <div className="space-meta-card__stats">
              <div className="space-meta-card__stat">
                <FileTextOutlined style={{ fontSize: 16, color: 'var(--color-accent)' }} />
                <div>
                  <div className="space-meta-card__stat-value">{space.docCount || 0}</div>
                  <div className="space-meta-card__stat-label">文档数</div>
                </div>
              </div>

              <div className="space-meta-card__stat">
                <CalendarOutlined style={{ fontSize: 16, color: 'var(--color-secondary)' }} />
                <div>
                  <div className="space-meta-card__stat-value" style={{ fontSize: 14 }}>
                    {new Date(space.createTime).toLocaleDateString('zh-CN')}
                  </div>
                  <div className="space-meta-card__stat-label">创建于</div>
                </div>
              </div>
            </div>

            <Divider style={{ margin: '16px 0' }} />

            <div className="space-meta-card__tags">
              <Tag
                color={visibility?.color}
                icon={visibility?.icon}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px', fontSize: 12 }}
              >
                {visibility?.label}
              </Tag>

              {space.smartParseEnabled && (
                <Tag
                  color="orange"
                  icon={<ThunderboltOutlined />}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px', fontSize: 12 }}
                >
                  智能解析
                </Tag>
              )}

              <Tag style={{ fontSize: 12, padding: '2px 10px' }}>
                {CHUNK_MODE_MAP[space.chunkMode] || space.chunkMode}
              </Tag>
            </div>

            {space.id !== 'DEFAULT' && !isEditing && (
              <>
                <Divider style={{ margin: '16px 0' }} />
                <div className="space-meta-card__actions">
                  <Button
                    variant="primary"
                    block
                    icon={<CloudUploadOutlined />}
                    onClick={() => router.push('/documents/upload')}
                    style={{ marginBottom: 8 }}
                  >
                    上传文档
                  </Button>
                  <Button
                    block
                    icon={<EditOutlined />}
                    onClick={() => setIsEditing(true)}
                  >
                    编辑配置
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 右侧：配置参数 */}
        <div className="space-detail-page__right">
          {!isEditing ? (
            <div className="space-config-cards">
              {/* 切片规则卡片 */}
              <div className="space-config-card">
                <div className="space-config-card__header">
                  <div className="space-config-card__icon" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)', color: '#3B82F6' }}>
                    <FileTextOutlined />
                  </div>
                  <div>
                    <div className="space-config-card__title">切片规则</div>
                    <div className="space-config-card__subtitle">文档解析与分片配置</div>
                  </div>
                </div>
                <div className="space-config-card__body">
                  <div className="space-config-item">
                    <span className="space-config-item__label">段长度</span>
                    <span className="space-config-item__value">{space.chunkSize} 字符</span>
                  </div>
                  <div className="space-config-item">
                    <span className="space-config-item__label">重叠率</span>
                    <span className="space-config-item__value">{space.overlapRatio}%</span>
                  </div>
                  <div className="space-config-item">
                    <span className="space-config-item__label">切片模式</span>
                    <Tag>{CHUNK_MODE_MAP[space.chunkMode] || space.chunkMode}</Tag>
                  </div>
                </div>
              </div>

              {/* 文件处理卡片 */}
              <div className="space-config-card">
                <div className="space-config-card__header">
                  <div className="space-config-card__icon" style={{ background: 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)', color: '#10B981' }}>
                    <ThunderboltOutlined />
                  </div>
                  <div>
                    <div className="space-config-card__title">文件处理</div>
                    <div className="space-config-card__subtitle">智能解析与处理选项</div>
                  </div>
                </div>
                <div className="space-config-card__body">
                  <div className="space-config-item">
                    <span className="space-config-item__label">智能解析</span>
                    <Tag color={space.smartParseEnabled ? 'green' : 'default'}>
                      {space.smartParseEnabled ? '已启用' : '已关闭'}
                    </Tag>
                  </div>
                  <div className="space-config-item">
                    <span className="space-config-item__label">可见范围</span>
                    <Tag color={visibility?.color} icon={visibility?.icon}>
                      {visibility?.label}
                    </Tag>
                  </div>
                </div>
              </div>

              {/* 系统信息卡片 */}
              <div className="space-config-card">
                <div className="space-config-card__header">
                  <div className="space-config-card__icon" style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)', color: '#8B5CF6' }}>
                    <CalendarOutlined />
                  </div>
                  <div>
                    <div className="space-config-card__title">系统信息</div>
                    <div className="space-config-card__subtitle">空间的系统属性</div>
                  </div>
                </div>
                <div className="space-config-card__body">
                  <div className="space-config-item">
                    <span className="space-config-item__label">空间 ID</span>
                    <Text code copyable style={{ fontSize: 12 }}>{space.id}</Text>
                  </div>
                  <div className="space-config-item">
                    <span className="space-config-item__label">创建时间</span>
                    <span className="space-config-item__value">{space.createTime}</span>
                  </div>
                  <div className="space-config-item">
                    <span className="space-config-item__label">更新时间</span>
                    <span className="space-config-item__value">{space.updateTime}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-config-card space-config-card--editing">
              <div className="space-config-card__header">
                <div className="space-config-card__icon" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)', color: '#3B82F6' }}>
                  <EditOutlined />
                </div>
                <div>
                  <div className="space-config-card__title">编辑空间配置</div>
                  <div className="space-config-card__subtitle">修改后点击右上角保存</div>
                </div>
              </div>
              <div className="space-config-card__body">
                <Form form={form} layout="vertical">
                  <Form.Item name="name" label="空间名称" rules={[{ required: true }]}>
                    <Input placeholder="输入空间名称" />
                  </Form.Item>

                  <Form.Item name="description" label="空间描述（选填）">
                    <Input.TextArea rows={2} placeholder="简要描述这个空间的用途" />
                  </Form.Item>

                  <Divider style={{ margin: '16px 0' }} />

                  <Form.Item name="chunkSize" label="段长度">
                    <Slider
                      min={100}
                      max={2000}
                      step={50}
                      marks={{ 100: '100', 512: '512', 1000: '1000', 2000: '2000' }}
                      tooltip={{ formatter: (v) => `${v} 字符` }}
                    />
                  </Form.Item>

                  <Form.Item name="overlapRatio" label="重叠率">
                    <Slider
                      min={0}
                      max={50}
                      step={5}
                      marks={{ 0: '0%', 10: '10%', 25: '25%', 50: '50%' }}
                      tooltip={{ formatter: (v) => `${v}%` }}
                    />
                  </Form.Item>

                  <Form.Item name="chunkMode" label="切片模式">
                    <Select style={{ width: '100%' }}>
                      <Select.Option value="HEAD_FIRST">从前到后</Select.Option>
                      <Select.Option value="TAIL_FIRST">从后到前</Select.Option>
                      <Select.Option value="UNIFORM">均匀切分</Select.Option>
                    </Select>
                  </Form.Item>

                  <Divider style={{ margin: '16px 0' }} />

                  <Form.Item name="smartParseEnabled" label="启用智能解析" valuePropName="checked">
                    <Switch />
                  </Form.Item>

                  <Form.Item name="visibility" label="可见范围">
                    <Select style={{ width: '100%' }}>
                      <Select.Option value="TEAM">团队内</Select.Option>
                      <Select.Option value="PUBLIC">公开</Select.Option>
                    </Select>
                  </Form.Item>
                </Form>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
