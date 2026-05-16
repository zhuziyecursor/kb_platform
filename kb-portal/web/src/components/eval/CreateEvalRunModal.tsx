'use client';

import React from 'react';
import { Modal, Form, Select, InputNumber, Switch, App } from 'antd';

interface Props {
  open: boolean;
  datasetId: string;
  spaceOptions: { value: string; label: string }[];
  onCancel: () => void;
  onSubmit: (values: { spaceId?: string; topK?: number; rerankEnabled?: boolean }) => void;
}

export default function CreateEvalRunModal({ open, datasetId, spaceOptions, onCancel, onSubmit }: Props) {
  const [form] = Form.useForm();

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      onSubmit({
        spaceId: values.spaceId,
        topK: values.topK || 20,
        rerankEnabled: values.rerankEnabled ?? true,
      });
      form.resetFields();
    } catch {}
  };

  return (
    <Modal
      title="新建评测运行"
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      okText="开始评测"
      cancelText="取消"
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item label="评测数据集">
          <input
            type="text"
            value={datasetId}
            disabled
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d9d9d9',
              borderRadius: 6,
              background: '#f5f5f5',
            }}
          />
        </Form.Item>

        <Form.Item name="spaceId" label="知识空间">
          <Select
            allowClear
            placeholder="不限空间（可选）"
            options={spaceOptions}
          />
        </Form.Item>

        <Form.Item name="topK" label="TopK 检索数量" initialValue={20}>
          <InputNumber min={5} max={50} style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item name="rerankEnabled" label="启用 Rerank" initialValue={true} valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
