'use client';

import React, { useState, Suspense } from 'react';
import {
  Form,
  Input,
  Select,
  Slider,
  Typography,
  Space,
  App,
  Alert,
  Divider,
  Switch,
  Steps,
} from 'antd';
import {
  FolderOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
  SafetyOutlined,
  CheckCircleOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { useRouter, useSearchParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui';
import { createSpace } from '@/api/knowledge-space';

const { Title, Text } = Typography;

function CreateSpaceForm() {
  const { message } = App.useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const parentId = searchParams.get('parentId');
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields([
        'name',
        'visibility',
        'chunkSize',
        'overlapRatio',
        'chunkMode',
      ]);
      setLoading(true);
      const payload = { ...values };
      if (parentId) {
        payload.parentId = parentId;
      }
      await createSpace(payload);
      message.success('知识空间创建成功');
      router.push('/spaces');
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        const fields = (error as { errorFields: Array<{ errors: string[] }> }).errorFields;
        message.error(fields[0]?.errors?.[0] || '请完善必填信息');
      } else if (error && typeof error === 'object' && 'response' in error) {
        const axiosErr = error as { response?: { data?: { message?: string } }; message?: string };
        message.error(axiosErr.response?.data?.message || axiosErr.message || '创建失败，请稍后重试');
      } else {
        message.error('创建失败，请稍后重试');
      }
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { title: '基本信息', icon: <FolderOutlined /> },
    { title: '文件处理', icon: <FileTextOutlined /> },
    { title: '切片规则', icon: <SafetyOutlined /> },
  ];

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <div className="space-form-step">
            <Form.Item
              name="name"
              label="空间名称"
              rules={[{ required: true, message: '请输入空间名称' }]}
            >
              <Input size="large" placeholder="例如：合规文档空间" />
            </Form.Item>

            <Form.Item
              name="description"
              label="空间描述（选填）"
            >
              <Input.TextArea
                placeholder="简要描述这个空间的用途"
                rows={3}
              />
            </Form.Item>

            <Form.Item
              name="visibility"
              label="可见范围"
            >
              <Select size="large" style={{ width: '100%' }}>
                <Select.Option value="TEAM">团队内</Select.Option>
                <Select.Option value="PUBLIC">公开</Select.Option>
              </Select>
            </Form.Item>
          </div>
        );
      case 1:
        return (
          <div className="space-form-step">
            <div className="space-form-feature">
              <div className="space-form-feature__icon" style={{ background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)', color: '#F59E0B' }}>
                <ThunderboltOutlined />
              </div>
              <div className="space-form-feature__content">
                <div className="space-form-feature__title">智能解析</div>
                <div className="space-form-feature__desc">
                  开启后使用智能解析（规则引擎 + LLM 精修），关闭时使用传统固定分片。
                </div>
                <Form.Item name="smartParseEnabled" valuePropName="checked" style={{ marginBottom: 0, marginTop: 12 }}>
                  <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                </Form.Item>
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-form-step">
            <Form.Item name="chunkSize" label="段长度">
              <Slider
                min={100}
                max={2000}
                step={50}
                marks={{ 100: '100', 512: '512', 1000: '1000', 2000: '2000' }}
                tooltip={{ formatter: (v) => `${v} 字符` }}
              />
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                每个文本块的字符数，建议 300-1000
              </Text>
            </Form.Item>

            <Form.Item name="overlapRatio" label="重叠率">
              <Slider
                min={0}
                max={50}
                step={5}
                marks={{ 0: '0%', 10: '10%', 25: '25%', 50: '50%' }}
                tooltip={{ formatter: (v) => `${v}%` }}
              />
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                相邻文本块之间的重叠比例，适度重叠可提高检索完整性
              </Text>
            </Form.Item>

            <Form.Item name="chunkMode" label="切片模式">
              <Select size="large" style={{ width: '100%' }}>
                <Select.Option value="HEAD_FIRST">从前到后</Select.Option>
                <Select.Option value="TAIL_FIRST">从后到前</Select.Option>
                <Select.Option value="UNIFORM">均匀切分</Select.Option>
              </Select>
            </Form.Item>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-create-page">
      {/* 左侧：步骤导航 */}
      <div className="space-create-page__left">
        <div className="space-create-nav">
          <Steps
            direction="vertical"
            current={currentStep}
            items={steps.map((s, i) => ({
              title: <span style={{ fontSize: 14, fontWeight: i === currentStep ? 600 : 400 }}>{s.title}</span>,
              icon: s.icon,
            }))}
            className="space-create-steps"
          />

          <div className="space-create-preview">
            <div className="space-create-preview__label">预览</div>
            <div className="space-create-preview__card">
              <div className="space-create-preview__icon">
                <FolderOutlined style={{ fontSize: 20, color: 'currentColor' }} />
              </div>
              <div className="space-create-preview__name">
                {form.getFieldValue('name') || '未命名空间'}
              </div>
              <div className="space-create-preview__meta">
                {form.getFieldValue('chunkSize') || 512} 字符 · {form.getFieldValue('chunkMode') === 'HEAD_FIRST' ? '从前到后' : form.getFieldValue('chunkMode') === 'TAIL_FIRST' ? '从后到前' : '均匀切分'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧：表单内容 */}
      <div className="space-create-page__right">
        <div className="space-form-card">
          {parentId && (
            <Alert
              message="正在父空间下创建子分类"
              description="子分类将继承父空间的层级关系，可用于进一步细分文档组织。"
              type="info"
              showIcon
              style={{ marginBottom: 24, borderRadius: 12 }}
            />
          )}

          <Form
            form={form}
            layout="vertical"
            initialValues={{
              smartParseEnabled: false,
              chunkSize: 512,
              overlapRatio: 10,
              chunkMode: 'HEAD_FIRST',
              visibility: 'TEAM',
            }}
          >
            {renderStepContent(currentStep)}
          </Form>

          <Divider style={{ margin: '24px 0' }} />

          <div className="space-form-actions">
            {currentStep > 0 && (
              <Button onClick={() => setCurrentStep(currentStep - 1)}>
                上一步
              </Button>
            )}
            {currentStep < steps.length - 1 ? (
              <Button variant="primary" onClick={() => setCurrentStep(currentStep + 1)}>
                下一步
              </Button>
            ) : (
              <Button variant="primary" icon={<CheckCircleOutlined />} onClick={handleSubmit} loading={loading}>
                创建空间
              </Button>
            )}
            <Button variant="ghost" onClick={() => router.push('/spaces')} style={{ marginLeft: 'auto' }}>
              <ArrowLeftOutlined /> 取消
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CreateSpacePage() {
  return (
    <AppLayout>
      <PageHeader
        breadcrumbs={[
          { title: '知识库', href: '/spaces' },
          { title: '知识空间' },
        ]}
        title="创建知识空间"
        description="配置知识空间的基本信息、切片规则和处理选项"
      />
      <Suspense fallback={
        <div className="space-create-page">
          <div className="space-create-page__left">
            <div className="space-create-nav" style={{ padding: 24 }}>
              <div style={{ height: 200, background: 'var(--color-muted)', borderRadius: 12 }} />
            </div>
          </div>
          <div className="space-create-page__right">
            <div className="space-form-card" style={{ padding: 32 }}>
              <div style={{ height: 400, background: 'var(--color-muted)', borderRadius: 12 }} />
            </div>
          </div>
        </div>
      }>
        <CreateSpaceForm />
      </Suspense>
    </AppLayout>
  );
}
