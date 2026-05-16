'use client';

import React, { useState } from 'react';
import { Form, Input, Button, Card, App } from 'antd';
import { ArrowLeftOutlined, RocketOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import HtmlFileSelector from '@/components/eval/HtmlFileSelector';
import { createDataset } from '@/api/http-client';
import { useUserContext } from '@/hooks/useUserContext';

const { TextArea } = Input;

export default function CreateDatasetPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const { tenantId } = useUserContext();
  const [loading, setLoading] = useState(false);
  const [sourceType, setSourceType] = useState('HTML_FILES');
  const [sourcePath, setSourcePath] = useState('');
  const [qaConfig, setQaConfig] = useState<Record<string, unknown>>({
    targetCount: 5000,
    typeDistribution: { FACTUAL: 30, COMPARISON: 25, MULTI_HOP: 25, UNANSWERABLE: 20 },
    chunkSize: 800,
    temperature: 0.7,
  });

  const handleFieldChange = (field: string, value: unknown) => {
    if (field === 'sourceType') setSourceType(value as string);
    if (field === 'sourcePath') setSourcePath(value as string);
    if (field === 'qaConfig') setQaConfig(value as Record<string, unknown>);
  };

  const handleCreate = async (values: { name: string; description?: string }) => {
    setLoading(true);
    try {
      const res = await createDataset({
        name: values.name,
        description: values.description,
        sourceType,
        sourcePath: sourcePath || undefined,
        tenantId,
        qaConfig,
      });
      message.success('数据集创建成功！');
      router.push(`/evaluation/datasets/${res.datasetId}`);
    } catch {
      message.error('创建失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="创建数据集"
        description="配置数据集来源和生成参数"
        extra={
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/evaluation/datasets')}>
            返回
          </Button>
        }
      />
      <Card style={{ maxWidth: 800 }}>
        <Form layout="vertical" onFinish={handleCreate} initialValues={{ name: '', description: '' }}>
          <Form.Item
            name="name"
            label="数据集名称"
            rules={[{ required: true, message: '请输入数据集名称' }]}
          >
            <Input placeholder="如：会计准则评测集 v1" maxLength={256} />
          </Form.Item>

          <Form.Item name="description" label="描述（可选）">
            <TextArea rows={2} placeholder="简要描述数据集的内容来源和用途" maxLength={500} />
          </Form.Item>

          <HtmlFileSelector
            sourceType={sourceType}
            sourcePath={sourcePath}
            qaConfig={qaConfig}
            onChange={handleFieldChange}
          />

          <Form.Item style={{ marginTop: 24 }}>
            <Button type="primary" htmlType="submit" loading={loading} icon={<RocketOutlined />} size="large">
              创建数据集
            </Button>
            <Button style={{ marginLeft: 12 }} onClick={() => router.push('/evaluation/datasets')} size="large">
              取消
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </AppLayout>
  );
}
