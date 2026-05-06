'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  Select,
  Slider,
  Button,
  Typography,
  Space,
  App,
  Divider,
  Descriptions,
  Tag,
} from 'antd';
import { CloudUploadOutlined } from '@ant-design/icons';
import { useRouter, useParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { getSpace, updateSpace } from '@/api/knowledge-space';
import type { KnowledgeSpace } from '@/types';

const { Title, Text } = Typography;

const CHUNK_MODE_MAP: Record<string, string> = {
  HEAD_FIRST: '从前到后',
  TAIL_FIRST: '从后到前',
  UNIFORM: '均匀切分',
};

const VISIBILITY_MAP: Record<string, { label: string; color: string }> = {
  PUBLIC: { label: '公开', color: 'green' },
  TEAM: { label: '团队内', color: 'blue' },
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
    return null;
  }

  return (
    <AppLayout>
      <Card
        title={
          <Space>
            <Title level={4} style={{ margin: 0 }}>知识空间详情</Title>
          </Space>
        }
        extra={
          <Space>
            {isEditing ? (
              <>
                <Button onClick={() => setIsEditing(false)}>取消</Button>
                <Button type="primary" onClick={handleSubmit} loading={loading}>
                  保存
                </Button>
              </>
            ) : (
              <>
                <Button onClick={() => router.push(`/documents/list?spaceId=${spaceId}`)}>
                  查看文档
                </Button>
                <Button icon={<CloudUploadOutlined />} onClick={() => router.push('/documents/upload')}>
                  上传文档
                </Button>
                <Button type="primary" onClick={() => setIsEditing(true)}>
                  编辑
                </Button>
              </>
            )}
          </Space>
        }
      >
        {!isEditing ? (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="空间ID" span={2}>
              <Text code>{space.id}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="空间名称" span={2}>
              <Text strong>{space.name}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="描述" span={2}>
              {space.description || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="段长度">
              <Text code>{space.chunkSize}</Text> 字符
            </Descriptions.Item>
            <Descriptions.Item label="重叠率">
              <Text code>{space.overlapRatio}</Text>%
            </Descriptions.Item>
            <Descriptions.Item label="切片模式">
              <Tag>{CHUNK_MODE_MAP[space.chunkMode]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="可见范围">
              <Tag color={VISIBILITY_MAP[space.visibility]?.color}>
                {VISIBILITY_MAP[space.visibility]?.label}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="文档数">
              <Text>{space.docCount || 0}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {space.createTime}
            </Descriptions.Item>
            <Descriptions.Item label="更新时间" span={2}>
              {space.updateTime}
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Form form={form} layout="vertical">
            <Form.Item name="name" label="空间名称" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="description" label="空间描述（选填）">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Divider>切片规则</Divider>
            <Form.Item name="chunkSize" label="段长度">
              <Slider min={100} max={2000} step={50} marks={{ 100: '100', 512: '512', 1000: '1000', 2000: '2000' }} />
            </Form.Item>
            <Form.Item name="overlapRatio" label="重叠率">
              <Slider min={0} max={50} step={5} marks={{ 0: '0%', 10: '10%', 25: '25%', 50: '50%' }} />
            </Form.Item>
            <Form.Item name="chunkMode" label="切片模式">
              <Select style={{ width: 200 }}>
                <Select.Option value="HEAD_FIRST">从前到后</Select.Option>
                <Select.Option value="TAIL_FIRST">从后到前</Select.Option>
                <Select.Option value="UNIFORM">均匀切分</Select.Option>
              </Select>
            </Form.Item>
            <Divider>可见范围</Divider>
            <Form.Item name="visibility" label="可见范围">
              <Select style={{ width: 200 }}>
                <Select.Option value="TEAM">团队内</Select.Option>
                <Select.Option value="PUBLIC">公开</Select.Option>
              </Select>
            </Form.Item>
          </Form>
        )}
      </Card>
    </AppLayout>
  );
}
