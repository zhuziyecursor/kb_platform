'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal,
  Card,
  Alert,
  Space,
  Tag,
  Typography,
  Descriptions,
  Collapse,
  Divider,
  Button,
  Spin,
} from 'antd';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
  DownOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import type { PipelineStep, PipelineSubStep, StepStatus } from '@/types';
import { getDocStatus, type DocSummary } from '@/api/http-client';
import dayjs from 'dayjs';

const { Text } = Typography;

interface PipelineDetailModalProps {
  doc: DocSummary | null;
  open: boolean;
  onClose: () => void;
}

const EMBEDDING_MODEL = 'BGE-zh-v1.5';
const EMBEDDING_DIM = 1024;

// 构建默认流水线步骤模板
const buildDefaultSteps = (): PipelineStep[] => [
  {
    title: '文件上传',
    description: '后端代理上传完成',
    status: 'finish',
    subSteps: [
      { label: '获取上传接口', status: 'finish', detail: '来自 kb-gateway' },
      { label: '文件上传至后端', status: 'finish', detail: '等待获取大小...' },
      { label: '生成 docId', status: 'finish', detail: '等待获取...' },
    ],
  },
  {
    title: '文档解析',
    description: 'TikaParser 提取文本内容',
    status: 'wait',
    subSteps: [
      { label: 'TikaParser 文本提取', status: 'wait', detail: '正在处理...' },
      { label: '文档元数据识别', status: 'wait', detail: '标题、作者、创建时间' },
      { label: '段落结构检测', status: 'wait', detail: '语义段落边界识别' },
    ],
  },
  {
    title: '文本清洗',
    description: '去除特殊字符与冗余内容',
    status: 'wait',
    subSteps: [
      { label: '特殊字符过滤', status: 'wait', detail: '移除控制字符、异常编码' },
      { label: '冗余内容去除', status: 'wait', detail: '页眉页脚、空白行、重复符号' },
      { label: '格式标准化', status: 'wait', detail: '统一换行符、编码 UTF-8' },
      { label: '空格规范化', status: 'wait', detail: '中英文空格、全角半角转换' },
    ],
  },
  {
    title: '智能切片',
    description: 'FixedLengthChunker 切片中',
    status: 'wait',
    subSteps: [
      { label: '固定长度分块', status: 'wait', detail: 'chunk_size=512 token, overlap=10%' },
      { label: '重叠窗口处理', status: 'wait', detail: '相邻 chunk 保留重叠区域' },
      { label: '生成切片列表', status: 'wait', detail: '预计生成若干 chunks' },
    ],
  },
  {
    title: '向量化入库',
    description: 'BGE 向量化 + Milvus upsert',
    status: 'wait',
    subSteps: [
      { label: 'BGE 向量生成', status: 'wait', detail: 'model=bge-zh-v1.5, dim=1024' },
      { label: 'Milvus upsert', status: 'wait', detail: '写入向量数据库' },
      { label: '索引更新', status: 'wait', detail: 'collection=kb_docs' },
    ],
  },
];

// 根据文档状态推断流水线步骤状态
const inferStepsFromStatus = (
  steps: PipelineStep[],
  docStatus: string,
  fileSize?: number | null,
  docId?: string,
  chunkSize?: number,
  overlapRatio?: number
): PipelineStep[] => {
  const updated = steps.map(s => ({ ...s, subSteps: s.subSteps ? s.subSteps.map(ss => ({ ...ss })) : undefined }));

  // 更新文件上传步骤的详情
  if (updated[0].subSteps) {
    updated[0].subSteps[2].detail = docId || '已生成';
    if (fileSize != null) {
      updated[0].subSteps[1].detail = `${(fileSize / 1024).toFixed(1)} KB`;
    }
  }

  // 更新切片规则详情
  if (updated[3].subSteps) {
    updated[3].subSteps[0].detail = `chunk_size=${chunkSize || 512} token, overlap=${overlapRatio || 10}%`;
  }

  switch (docStatus) {
    case 'DRAFT':
      // 文件上传 finish，其余 wait
      updated[0].status = 'finish';
      for (let i = 1; i < updated.length; i++) {
        updated[i].status = 'wait';
        updated[i].description = getStepDescription(i, 'wait');
      }
      break;
    case 'PENDING':
      updated[0].status = 'finish';
      updated[1].status = 'process';
      updated[1].description = '等待 Kafka 消费，即将开始解析...';
      for (let i = 2; i < updated.length; i++) {
        updated[i].status = 'wait';
        updated[i].description = getStepDescription(i, 'wait');
      }
      break;
    case 'PROCESSING':
      updated[0].status = 'finish';
      updated[1].status = 'process';
      updated[1].description = 'TikaParser 正在提取文本内容...';
      if (updated[1].subSteps) {
        updated[1].subSteps[0].status = 'process';
        updated[1].subSteps[0].detail = '正在处理中...';
      }
      for (let i = 2; i < updated.length; i++) {
        updated[i].status = 'wait';
        updated[i].description = getStepDescription(i, 'wait');
      }
      break;
    case 'READY':
      updated.forEach(s => {
        s.status = 'finish';
        s.description = getStepDescription(updated.indexOf(s), 'finish');
        if (s.subSteps) {
          s.subSteps.forEach(ss => { ss.status = 'finish'; });
        }
      });
      break;
    case 'FAILED':
      updated[0].status = 'finish';
      // 保守估计：标记向量化入库失败（因为通常是最后一步容易出问题）
      updated[4].status = 'error';
      updated[4].description = '处理失败，请查看错误日志或重试';
      for (let i = 1; i < 4; i++) {
        updated[i].status = 'finish';
        updated[i].description = getStepDescription(i, 'finish');
      }
      break;
    default:
      break;
  }

  return updated;
};

const getStepDescription = (stepIndex: number, status: StepStatus): string => {
  const descriptions = [
    { wait: '等待上传文件', process: '正在上传文件...', finish: '后端代理上传完成', error: '上传失败' },
    { wait: '等待解析...', process: 'TikaParser 正在提取文本内容...', finish: '文本提取完成', error: '解析失败' },
    { wait: '等待清洗...', process: '去除特殊字符与冗余内容...', finish: '文本清洗完成', error: '清洗失败' },
    { wait: '等待切片...', process: 'FixedLengthChunker 切片中...', finish: '智能切片完成', error: '切片失败' },
    { wait: '等待向量化...', process: 'BGE 向量化 + Milvus upsert...', finish: '向量化入库完成', error: '向量化失败' },
  ];
  return descriptions[stepIndex][status];
};

const stepIcon = (status: PipelineStep['status']) => {
  if (status === 'finish') return <CheckCircleFilled style={{ color: 'var(--color-success)' }} />;
  if (status === 'error') return <CloseCircleFilled style={{ color: 'var(--color-destructive)' }} />;
  if (status === 'process') return <LoadingOutlined style={{ color: 'var(--color-accent)' }} />;
  return null;
};

export default function PipelineDetailModal({ doc, open, onClose }: PipelineDetailModalProps) {
  const [steps, setSteps] = useState<PipelineStep[]>(buildDefaultSteps());
  const [loading, setLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);
  const [polling, setPolling] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setPolling(false);
  }, []);

  // 打开 Modal 时初始化
  useEffect(() => {
    if (open && doc) {
      setLoading(true);
      const initSteps = inferStepsFromStatus(
        buildDefaultSteps(),
        doc.status,
        doc.fileSize,
        doc.docId,
        512,
        10
      );
      setSteps(initSteps);
      setElapsedSeconds(null);
      setLoading(false);

      // 非终态文档开始轮询
      if (doc.status === 'PENDING' || doc.status === 'PROCESSING') {
        startTimeRef.current = Date.now();
        setPolling(true);
      }
    }
    if (!open) {
      stopPolling();
    }
  }, [open, doc, stopPolling]);

  // 轮询逻辑
  useEffect(() => {
    if (!polling || !doc) return;

    const poll = async () => {
      try {
        const status = await getDocStatus(doc.docId, doc.version);
        setSteps(prev => inferStepsFromStatus(prev, status.status, doc.fileSize, doc.docId, 512, 10));

        if (status.status === 'READY') {
          const elapsed = ((Date.now() - startTimeRef.current) / 1000);
          setElapsedSeconds(parseFloat(elapsed.toFixed(1)));
          stopPolling();
        }
        if (status.status === 'FAILED') {
          stopPolling();
        }
      } catch {
        // ignore polling errors
      }
    };

    pollingRef.current = setInterval(poll, 3000);
    poll();

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [polling, doc, stopPolling]);

  if (!doc) return null;

  const isProcessing = doc.status === 'PENDING' || doc.status === 'PROCESSING';
  const isReady = doc.status === 'READY';
  const isFailed = doc.status === 'FAILED';

  const secLevelMap: Record<number, string> = {
    1: '公开',
    2: '内部',
    3: '机密',
    4: '秘密',
    5: '绝密',
  };

  return (
    <Modal
      title={
        <Space>
          <FileTextOutlined />
          <span>文档解析详情</span>
          {polling && <Spin size="small" />}
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
      ]}
      width={800}
      bodyStyle={{ maxHeight: '70vh', overflow: 'auto', padding: '16px 24px' }}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
          <div style={{ marginTop: 12 }}><Text type="secondary">加载中...</Text></div>
        </div>
      ) : (
        <>
          {/* 状态提示 */}
          <Alert
            message={
              isProcessing
                ? '流水线处理中'
                : isReady
                ? '入库流程已完成'
                : isFailed
                ? '处理失败'
                : '等待处理'
            }
            description={
              isProcessing
                ? '系统正在执行：解析 → 清洗 → 切片 → 向量化入库，预计耗时 2-5 分钟...'
                : isReady
                ? '入库流程已完成，文档已进入可检索状态'
                : isFailed
                ? '文档处理过程中发生错误，请查看详情或重试'
                : '文档已创建，等待触发入库流程'
            }
            type={isProcessing ? 'info' : isReady ? 'success' : isFailed ? 'error' : 'warning'}
            showIcon
            style={{ marginBottom: 24 }}
          />

          {/* 流水线步骤 */}
          <Card
            title="文档入库流水线"
            style={{ marginBottom: 24, background: 'var(--color-muted)' }}
            size="small"
          >
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {steps.map((step, index) => (
                <Card
                  key={index}
                  size="small"
                  style={{
                    background: step.status === 'process' ? 'rgba(37, 99, 235, 0.06)' : 'var(--color-muted)',
                    border: step.status === 'process' ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                  }}
                >
                  {/* 主步骤头部 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Space>
                      {stepIcon(step.status)}
                      <Text strong style={{ fontSize: 14 }}>{step.title}</Text>
                      {step.status === 'process' && (
                        <Tag color="processing" style={{ fontSize: 11 }}>处理中</Tag>
                      )}
                      {step.status === 'wait' && (
                        <Tag style={{ fontSize: 11 }}>等待中</Tag>
                      )}
                      {step.status === 'finish' && (
                        <Tag color="success" style={{ fontSize: 11 }}>已完成</Tag>
                      )}
                      {step.status === 'error' && (
                        <Tag color="error" style={{ fontSize: 11 }}>失败</Tag>
                      )}
                    </Space>
                    <Space>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {step.description}
                      </Text>
                      {step.timestamp && (
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {step.timestamp}
                        </Text>
                      )}
                    </Space>
                  </div>

                  {/* 子步骤详情 */}
                  {step.subSteps && step.subSteps.length > 0 && (
                    <Collapse
                      ghost
                      size="small"
                      style={{ marginTop: 12 }}
                      expandIcon={({ isActive }) => <DownOutlined rotate={isActive ? 180 : 0} />}
                      items={[
                        {
                          key: String(index),
                          label: (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              查看详情 ({step.subSteps.filter(s => s.status === 'finish').length}/{step.subSteps.length} 完成)
                            </Text>
                          ),
                          children: (
                            <div style={{ paddingLeft: 8 }}>
                              {step.subSteps.map((sub, subIdx) => (
                                <div
                                  key={subIdx}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '6px 0',
                                    borderLeft: sub.status === 'process' ? '2px solid var(--color-accent)' : '2px solid transparent',
                                    paddingLeft: sub.status === 'process' ? 12 : 14,
                                  }}
                                >
                                  {sub.status === 'finish' && (
                                    <CheckCircleFilled style={{ color: 'var(--color-success)', marginRight: 8, fontSize: 12 }} />
                                  )}
                                  {sub.status === 'process' && (
                                    <LoadingOutlined style={{ color: 'var(--color-accent)', marginRight: 8, fontSize: 12 }} />
                                  )}
                                  {sub.status === 'wait' && (
                                    <div style={{
                                      width: 12,
                                      height: 12,
                                      borderRadius: '50%',
                                      border: '1px solid var(--color-border)',
                                      marginRight: 8,
                                    }} />
                                  )}
                                  {sub.status === 'error' && (
                                    <CloseCircleFilled style={{ color: 'var(--color-destructive)', marginRight: 8, fontSize: 12 }} />
                                  )}
                                  <Text style={{ fontSize: 13, color: sub.status === 'process' ? 'var(--color-accent)' : undefined }}>
                                    {sub.label}
                                  </Text>
                                  {sub.detail && (
                                    <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                                      {sub.detail}
                                    </Text>
                                  )}
                                  {sub.status === 'process' && (
                                    <Tag color="processing" style={{ marginLeft: 8, fontSize: 10 }}>执行中</Tag>
                                  )}
                                </div>
                              ))}
                            </div>
                          ),
                        },
                      ]}
                    />
                  )}
                </Card>
              ))}
            </Space>
          </Card>

          {/* 入库结果汇总 */}
          {(isReady || isFailed) && (
            <Card
              title="入库结果"
              size="small"
              style={{
                background: isReady ? 'rgba(22, 163, 74, 0.06)' : 'rgba(220, 38, 38, 0.06)',
                border: `1px solid ${isReady ? 'var(--color-success)' : 'var(--color-destructive)'}`,
              }}
            >
              <Descriptions column={2} size="small">
                <Descriptions.Item label="文档ID">
                  <Text code copyable>{doc.docId}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="版本号">v{doc.version}</Descriptions.Item>
                <Descriptions.Item label="文件名">{doc.title}</Descriptions.Item>
                <Descriptions.Item label="文件大小">
                  {doc.fileSize != null ? `${(doc.fileSize / 1024).toFixed(1)} KB` : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="处理耗时">
                  {elapsedSeconds != null ? `${elapsedSeconds} 秒` : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="文档密级">
                  {secLevelMap[doc.secLevel] || '未知'}
                </Descriptions.Item>
                <Descriptions.Item label="切片规则">
                  段长 512，重叠 10%
                </Descriptions.Item>
                <Descriptions.Item label="向量模型">
                  {EMBEDDING_MODEL}（{EMBEDDING_DIM} 维）
                </Descriptions.Item>
                <Descriptions.Item label="状态">
                  {isReady ? (
                    <Tag color="success" icon={<CheckCircleFilled />}>
                      READY — 可被检索
                    </Tag>
                  ) : (
                    <Tag color="error" icon={<CloseCircleFilled />}>
                      FAILED — 处理失败
                    </Tag>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="创建时间">
                  {doc.createTime ? dayjs(doc.createTime).format('YYYY-MM-DD HH:mm:ss') : '—'}
                </Descriptions.Item>
              </Descriptions>
            </Card>
          )}
        </>
      )}
    </Modal>
  );
}
