'use client';

import React, { useState } from 'react';
import {
  Card,
  Form,
  Input,
  Select,
  Slider,
  Button,
  Typography,
  Space,
  message,
  Alert,
  Divider,
} from 'antd';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { createSpace } from '@/api/knowledge-space';

const { Title, Text } = Typography;

export default function CreateSpacePage() {
  const router = useRouter();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await createSpace(values);
      message.success('知识空间创建成功');
      router.push('/spaces');
    } catch {
      message.error('请完善必填信息');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <Card
        title={
          <Space>
            <Title level={4} style={{ margin: 0 }}>创建知识空间</Title>
          </Space>
        }
        extra={
          <Button onClick={() => router.push('/spaces')}>取消</Button>
        }
      >
        <Alert
          message="知识空间用途"
          description="知识空间用于组织文档，可配置统一的切片规则。上传文档时可选择放入特定空间。"
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            chunkSize: 512,
            overlapRatio: 10,
            chunkMode: 'HEAD_FIRST',
            visibility: 'TEAM',
          }}
        >
          <Form.Item
            name="name"
            label="空间名称"
            rules={[{ required: true, message: '请输入空间名称' }]}
          >
            <Input placeholder="例如：合规文档空间" />
          </Form.Item>

          <Form.Item
            name="description"
            label="空间描述（选填）"
          >
            <Input.TextArea
              placeholder="简要描述这个空间的用途"
              rows={2}
            />
          </Form.Item>

          <Divider>切片规则</Divider>

          <Form.Item
            name="chunkSize"
            label="段长度"
            tooltip="每个文本块的字符数，建议 300-1000"
          >
            <Slider
              min={100}
              max={2000}
              step={50}
              marks={{ 100: '100', 512: '512', 1000: '1000', 2000: '2000' }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              当前: {form.getFieldValue('chunkSize')} 字符
            </Text>
          </Form.Item>

          <Form.Item
            name="overlapRatio"
            label="重叠率"
            tooltip="相邻文本块之间的重叠比例，适度重叠可提高检索完整性"
          >
            <Slider
              min={0}
              max={50}
              step={5}
              marks={{ 0: '0%', 10: '10%', 25: '25%', 50: '50%' }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              当前: {form.getFieldValue('overlapRatio')}%
            </Text>
          </Form.Item>

          <Form.Item
            name="chunkMode"
            label="切片模式"
          >
            <Select style={{ width: 200 }}>
              <Select.Option value="HEAD_FIRST">从前到后</Select.Option>
              <Select.Option value="TAIL_FIRST">从后到前</Select.Option>
              <Select.Option value="UNIFORM">均匀切分</Select.Option>
            </Select>
          </Form.Item>

          <Divider>可见范围</Divider>

          <Form.Item
            name="visibility"
            label="可见范围"
          >
            <Select style={{ width: 200 }}>
              <Select.Option value="TEAM">团队内</Select.Option>
              <Select.Option value="PUBLIC">公开</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" onClick={handleSubmit} loading={loading}>
                创建空间
              </Button>
              <Button onClick={() => router.push('/spaces')}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </AppLayout>
  );
}
