'use client';

import React from 'react';
import { Form, Select, Slider, Switch, InputNumber, Space, Button, Typography } from 'antd';
import { FolderOpenOutlined, UploadOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface Props {
  sourceType: string;
  sourcePath: string;
  qaConfig: Record<string, unknown>;
  onChange: (field: string, value: unknown) => void;
}

export default function HtmlFileSelector({ sourceType, sourcePath, qaConfig, onChange }: Props) {
  return (
    <div>
      <Form.Item label="文件来源" required>
        <Select
          value={sourceType}
          onChange={(v) => onChange('sourceType', v)}
          style={{ width: 300 }}
          options={[
            { value: 'HTML_FILES', label: '本地HTML文件目录' },
            { value: 'MANUAL_UPLOAD', label: '手动上传文件' },
          ]}
        />
      </Form.Item>

      {sourceType === 'HTML_FILES' && (
        <Form.Item label="目录路径" help="输入服务器上HTML文件所在的绝对路径">
          <input
            type="text"
            value={sourcePath}
            onChange={(e) => onChange('sourcePath', e.target.value)}
            placeholder="/path/to/html/files"
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d9d9d9',
              borderRadius: 6,
              fontSize: 14,
            }}
          />
        </Form.Item>
      )}

      {sourceType === 'MANUAL_UPLOAD' && (
        <Form.Item label="上传文件">
          <Button icon={<UploadOutlined />}>选择HTML文件</Button>
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            支持批量选择 .html 文件
          </Text>
        </Form.Item>
      )}

      <Form.Item label="目标QA数量">
        <Slider
          min={100}
          max={10000}
          step={100}
          value={(qaConfig.targetCount as number) || 5000}
          onChange={(v) => onChange('qaConfig', { ...qaConfig, targetCount: v })}
          marks={{ 500: '500', 2000: '2k', 5000: '5k', 10000: '10k' }}
        />
      </Form.Item>

      <Form.Item label="类型分布">
        <Space direction="vertical" style={{ width: '100%' }}>
          {['FACTUAL', 'COMPARISON', 'MULTI_HOP', 'UNANSWERABLE'].map(type => {
            const distribution = (qaConfig.typeDistribution as Record<string, number>) || {};
            return (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text style={{ width: 100 }}>{type}</Text>
                <Slider
                  style={{ flex: 1 }}
                  min={0}
                  max={100}
                  value={distribution[type] || 0}
                  onChange={(v) => onChange('qaConfig', {
                    ...qaConfig,
                    typeDistribution: { ...distribution, [type]: v },
                  })}
                />
                <Text style={{ width: 40 }}>{distribution[type] || 0}%</Text>
              </div>
            );
          })}
        </Space>
      </Form.Item>

      <Form.Item label="高级选项">
        <Space direction="vertical">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text style={{ width: 80 }}>分块大小</Text>
            <InputNumber
              min={200}
              max={2000}
              value={(qaConfig.chunkSize as number) || 800}
              onChange={(v) => onChange('qaConfig', { ...qaConfig, chunkSize: v })}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text style={{ width: 80 }}>温度</Text>
            <Slider
              style={{ width: 200 }}
              min={0}
              max={1}
              step={0.1}
              value={(qaConfig.temperature as number) || 0.7}
              onChange={(v) => onChange('qaConfig', { ...qaConfig, temperature: v })}
            />
          </div>
        </Space>
      </Form.Item>
    </div>
  );
}
