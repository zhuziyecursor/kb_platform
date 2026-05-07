'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  Typography,
  Space,
  Descriptions,
  Tag,
  Divider,
  Switch,
  Select,
  Button,
  App,
  Modal,
  Form,
  Input,
  Popconfirm,
  Table,
  Upload,
  Alert,
  message as antdMessage,
} from 'antd';
import {
  SettingOutlined,
  UserOutlined,
  ApiOutlined,
  InfoCircleOutlined,
  BgColorsOutlined,
  GlobalOutlined,
  PlusOutlined,
  DeleteOutlined,
  DownloadOutlined,
  UploadOutlined,
  EditOutlined,
  StarOutlined,
} from '@ant-design/icons';
import type { UploadProps } from 'antd';
import AppLayout from '@/components/AppLayout';
import { useTheme } from '@/components/ThemeProvider';
import { useLLMModels, LLM_PROVIDERS, DEFAULT_MODELS } from '@/hooks/useLLMModels';
import type { LLMModelConfig, LLMProvider } from '@/types';

const { Title, Text } = Typography;

export default function SettingsPage() {
  const { themeMode, setThemeMode, resolvedTheme } = useTheme();
  const { message: antdMsg } = App.useApp();
  const [isLoaded] = useState(true);

  // LLM 模型管理
  const {
    models,
    addModel,
    removeModel,
    updateModel,
    setDefaultModel,
    exportModels,
    importModels,
  } = useLLMModels();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingModel, setEditingModel] = useState<LLMModelConfig | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider>('minimax');
  const [form] = Form.useForm();
  const [username, setUsername] = useState('admin');
  const [roleLabel, setRoleLabel] = useState('管理员');

  useEffect(() => {
    setUsername(sessionStorage.getItem('username') || 'admin');
    setRoleLabel(sessionStorage.getItem('roleLabel') || '管理员');
  }, []);

  // 打开添加/编辑弹窗
  const openModal = (model?: LLMModelConfig) => {
    setEditingModel(model || null);
    if (model) {
      setSelectedProvider(model.provider);
      form.setFieldsValue({
        provider: model.provider,
        apiKey: model.apiKey,
        modelName: model.modelName,
      });
    } else {
      setSelectedProvider('minimax');
      form.resetFields();
    }
    setModalVisible(true);
  };

  // 保存模型
  const handleSaveModel = async () => {
    try {
      const values = await form.validateFields();
      if (editingModel) {
        updateModel(editingModel.id, values);
        antdMsg.success('模型已更新');
      } else {
        // 自动生成显示名称
        const provider = LLM_PROVIDERS.find(p => p.value === values.provider);
        const displayName = `${provider?.label || values.provider} ${values.modelName}`;
        addModel({ ...values, name: displayName });
        antdMsg.success('模型已添加');
      }
      setModalVisible(false);
      form.resetFields();
    } catch {
      // 表单验证失败
    }
  };

  // 导入模型
  const importProps: UploadProps = {
    accept: '.json',
    showUploadList: false,
    beforeUpload: async (file) => {
      const success = await importModels(file);
      if (success) {
        antdMsg.success('模型配置导入成功');
      } else {
        antdMsg.error('导入失败，请检查文件格式');
      }
      return false;
    },
  };

  // 表格列定义
  const columns = [
    {
      title: '模型',
      dataIndex: 'modelName',
      key: 'modelName',
      render: (text: string, record: LLMModelConfig) => (
        <Space>
          <Text code>{text}</Text>
          {record.isDefault && <StarOutlined style={{ color: '#faad14' }} />}
        </Space>
      ),
    },
    {
      title: '提供商',
      dataIndex: 'provider',
      key: 'provider',
      render: (provider: LLMProvider) => {
        const info = LLM_PROVIDERS.find(p => p.value === provider);
        return (
          <Tag>
            {info?.icon} {info?.label}
          </Tag>
        );
      },
    },
    {
      title: 'API Key',
      dataIndex: 'apiKey',
      key: 'apiKey',
      render: (text: string) => (
        text ? <Text type="secondary">••••••••{text.slice(-4)}</Text> : <Text type="secondary">未设置</Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_: unknown, record: LLMModelConfig) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openModal(record)}
          />
          {!record.isDefault && (
            <Button
              type="text"
              size="small"
              icon={<StarOutlined />}
              onClick={() => {
                setDefaultModel(record.id);
                antdMsg.success('已设为默认模型');
              }}
            />
          )}
          <Popconfirm
            title="确定删除该模型？"
            onConfirm={() => {
              removeModel(record.id);
              antdMsg.success('模型已删除');
            }}
            okText="删除"
            cancelText="取消"
          >
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <AppLayout>
      <div style={{ marginBottom: 24 }}>
        <Space>
          <SettingOutlined style={{ fontSize: 22, color: 'var(--color-primary)' }} />
          <Title level={4} style={{ margin: 0 }}>系统设置</Title>
        </Space>
      </div>

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card title={<><UserOutlined /> 个人设置</>}>
          <Descriptions column={1} size="small" labelStyle={{ width: 120 }}>
            <Descriptions.Item label="用户名">
              <Text strong>{username}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="角色">
              <Tag color="blue">{roleLabel}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="登录方式">
              <Tag>OAuth2 / OBO Token</Tag>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title={<><BgColorsOutlined /> 外观设置</>}>
          <Descriptions column={1} size="small" labelStyle={{ width: 120 }}>
            <Descriptions.Item label="主题模式">
              <Select
                value={themeMode}
                onChange={(val) => setThemeMode(val)}
                style={{ width: 150 }}
                options={[
                  { label: '随系统', value: 'system' },
                  { label: '浅色模式', value: 'light' },
                  { label: '深色模式', value: 'dark' },
                ]}
              />
            </Descriptions.Item>
            <Descriptions.Item label="当前生效">
              <Tag color={resolvedTheme === 'dark' ? 'purple' : 'gold'}>
                {resolvedTheme === 'dark' ? '深色' : '浅色'}
              </Tag>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card
          title={<><GlobalOutlined /> LLM 模型配置</>}
          extra={
            <Space>
              <Upload {...importProps}>
                <Button icon={<UploadOutlined />} size="small">导入</Button>
              </Upload>
              <Button icon={<DownloadOutlined />} size="small" onClick={exportModels}>导出</Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                size="small"
                onClick={() => openModal()}
              >
                添加模型
              </Button>
            </Space>
          }
        >
          <Table
            dataSource={models}
            columns={columns}
            rowKey="id"
            pagination={false}
            size="small"
          />
          <Alert
            message="配置说明"
            description="模型配置保存在浏览器本地存储中，支持导入/导出 JSON 备份。问答时可选择不同模型。"
            type="info"
            showIcon
            style={{ marginTop: 16 }}
          />
        </Card>

        <Card title={<><ApiOutlined /> 连接配置</>}>
          <Descriptions column={1} size="small" labelStyle={{ width: 120 }}>
            <Descriptions.Item label="网关地址">
              <Text code>{process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:8081'}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="认证方式">
              <Tag>Bearer JWT (OBO)</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Token 有效期">
              <Text>5 分钟</Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title={<><InfoCircleOutlined /> 系统信息</>}>
          <Descriptions column={1} size="small" labelStyle={{ width: 120 }}>
            <Descriptions.Item label="平台版本">
              <Tag>MVP v1.0.0</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="前端框架">
              <Text>Next.js + Ant Design</Text>
            </Descriptions.Item>
            <Descriptions.Item label="后端框架">
              <Text>Spring Boot 3.2 + Kafka</Text>
            </Descriptions.Item>
            <Descriptions.Item label="嵌入模型">
              <Text code>BGE-zh-v1.5</Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      </Space>

      {/* 添加/编辑模型弹窗 */}
      <Modal
        title={editingModel ? '编辑模型' : '添加模型'}
        open={modalVisible}
        onOk={handleSaveModel}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
        }}
        okText="保存"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            provider: 'minimax',
            modelName: 'MiniMax-M2.7',
          }}
        >
          <Form.Item
            name="provider"
            label="提供商"
            rules={[{ required: true, message: '请选择提供商' }]}
          >
            <Select
              value={selectedProvider}
              options={LLM_PROVIDERS.map(p => ({
                label: `${p.icon} ${p.label}`,
                value: p.value,
              }))}
              onChange={(value) => {
                setSelectedProvider(value);
                const provider = LLM_PROVIDERS.find(p => p.value === value);
                if (provider) {
                  form.setFieldsValue({ modelName: provider.defaultModel });
                }
              }}
            />
          </Form.Item>

          <Form.Item
            name="modelName"
            label="模型"
            rules={[{ required: true, message: '请选择模型' }]}
          >
            <Select
              showSearch
              allowClear
              placeholder="选择模型"
              options={(DEFAULT_MODELS[selectedProvider] || []).map(m => ({
                label: m,
                value: m,
              }))}
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>

          <Form.Item
            name="apiKey"
            label="API Key（选填）"
            tooltip="不填则使用系统默认配置"
          >
            <Input.Password placeholder="请输入 API Key" />
          </Form.Item>
        </Form>
      </Modal>
    </AppLayout>
  );
}
