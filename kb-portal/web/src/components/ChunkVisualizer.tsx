'use client';

import React, { useRef, useMemo, useState, useCallback } from 'react';
import { Modal, Tag, List, Typography, Tooltip, Badge, Segmented, Space, Spin, Empty } from 'antd';
import { FileTextOutlined, OrderedListOutlined, InfoCircleOutlined } from '@ant-design/icons';
import type { DocChunksResponse } from '@/api/http-client';

const { Text, Title } = Typography;

const CHUNK_COLORS = [
  'rgba(255, 235, 205, 0.50)',
  'rgba(220, 240, 255, 0.50)',
  'rgba(230, 255, 220, 0.50)',
  'rgba(255, 220, 240, 0.50)',
  'rgba(240, 240, 200, 0.50)',
  'rgba(220, 230, 255, 0.50)',
  'rgba(255, 230, 220, 0.50)',
  'rgba(210, 250, 240, 0.50)',
];

const CHUNK_BORDERS = [
  '#e8a040', '#4096e8', '#52c41a', '#e8609a',
  '#b8a000', '#6078d0', '#e87040', '#20a080',
];

interface Props {
  open: boolean;
  onClose: () => void;
  data: DocChunksResponse | null;
  loading: boolean;
}

export default function ChunkVisualizer({ open, onClose, data, loading }: Props) {
  const [viewMode, setViewMode] = useState<string>('text');
  const [activeSeq, setActiveSeq] = useState<number | null>(null);
  const chunkRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const segments = useMemo(() => {
    if (!data) return [];
    return data.chunks.map((chunk, i) => ({
      chunk,
      bg: CHUNK_COLORS[i % CHUNK_COLORS.length],
      border: CHUNK_BORDERS[i % CHUNK_BORDERS.length],
    }));
  }, [data]);

  const scrollToChunk = useCallback((seq: number) => {
    setActiveSeq(seq);
    const el = chunkRefs.current.get(seq);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const modalTitle = (
    <Space>
      <FileTextOutlined />
      <span>分片可视化</span>
      {data && <Tag color="blue">{data.totalChunks} 个分片</Tag>}
    </Space>
  );

  return (
    <Modal
      title={modalTitle}
      open={open}
      onCancel={onClose}
      width="90vw"
      style={{ top: 20 }}
      footer={null}
      destroyOnClose
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : !data ? (
        <Empty description="暂无分片数据" />
      ) : (
        <>
          {/* ---- toolbar ---- */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 16, padding: '8px 12px', background: '#fafafa', borderRadius: 6,
          }}>
            <Space size="small">
              <Text type="secondary" style={{ fontSize: 12 }}>
                <Text code>{data.docId}</Text> v{data.version}
              </Text>
              <Tooltip title="字符位置 = 该 chunk 在原文中的起止偏移量">
                <InfoCircleOutlined style={{ color: '#999', fontSize: 12 }} />
              </Tooltip>
            </Space>
            <Segmented
              value={viewMode}
              onChange={(v) => { setViewMode(v as string); setActiveSeq(null); }}
              options={[
                { label: '原文标注', value: 'text', icon: <FileTextOutlined /> },
                { label: '分片列表', value: 'list', icon: <OrderedListOutlined /> },
              ]}
            />
          </div>

          {viewMode === 'text' ? (
            /* ======== 原文标注视图 ======== */
            <div style={{ display: 'flex', gap: 16, height: '65vh' }}>
              {/* 原文区 */}
              <div style={{
                flex: 1, overflow: 'auto', padding: '20px 24px',
                background: '#fdfdfd', borderRadius: 8,
                border: '1px solid #e8e8e8', lineHeight: 2.3,
                fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {data.cleanedText.length === 0 ? (
                  <Text type="secondary">（原文为空）</Text>
                ) : segments.length === 0 ? (
                  data.cleanedText
                ) : (
                  segments.map((seg, i) => (
                    <span
                      key={i}
                      ref={(el) => { if (el) chunkRefs.current.set(seg.chunk.chunkSeq, el as any); }}
                      onClick={() => setActiveSeq(activeSeq === seg.chunk.chunkSeq ? null : seg.chunk.chunkSeq)}
                      style={{
                        backgroundColor: activeSeq === seg.chunk.chunkSeq
                          ? seg.bg.replace('0.50', '0.85') : seg.bg,
                        borderLeft: `3px solid ${seg.border}`,
                        paddingLeft: 5, paddingRight: 1,
                        borderRadius: '0 3px 3px 0',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s',
                      }}
                    >
                      <Tooltip title={`分片 ${seg.chunk.chunkSeq} · ${seg.chunk.charCount} 字符 · 位置 [${seg.chunk.charStart}–${seg.chunk.charEnd}]`}>
                        <sup style={{
                          fontSize: 9, fontWeight: 700, color: seg.border,
                          background: '#fff', borderRadius: '50%',
                          width: 17, height: 17, marginRight: 3,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          border: `1.5px solid ${seg.border}`, cursor: 'pointer',
                        }}>
                          {seg.chunk.chunkSeq}
                        </sup>
                      </Tooltip>
                      {seg.chunk.text}
                    </span>
                  ))
                )}
              </div>

              {/* 右侧索引 */}
              <div style={{
                width: 240, flexShrink: 0, overflow: 'auto',
                border: '1px solid #e8e8e8', borderRadius: 8, background: '#fff',
              }}>
                <div style={{
                  padding: '8px 12px', fontWeight: 600, fontSize: 13, color: '#555',
                  borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 0, background: '#fff', zIndex: 1,
                }}>
                  分片索引
                </div>
                {segments.map((seg, i) => (
                  <div
                    key={seg.chunk.chunkSeq}
                    onClick={() => scrollToChunk(seg.chunk.chunkSeq)}
                    style={{
                      padding: '8px 12px', cursor: 'pointer',
                      borderBottom: '1px solid #f5f5f5',
                      background: activeSeq === seg.chunk.chunkSeq ? seg.bg.replace('0.50', '0.75') : 'transparent',
                      borderLeft: activeSeq === seg.chunk.chunkSeq ? `3px solid ${seg.border}` : '3px solid transparent',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Badge count={seg.chunk.chunkSeq} style={{ backgroundColor: seg.border }} />
                      <Text type="secondary" style={{ fontSize: 11 }}>{seg.chunk.charCount} 字</Text>
                    </div>
                    {seg.chunk.sectionPath && (
                      <Text type="secondary" style={{ fontSize: 10 }}>{seg.chunk.sectionPath}</Text>
                    )}
                    <div style={{ marginTop: 2 }}>
                      <Text ellipsis style={{ fontSize: 12, color: '#555', maxWidth: '100%' }}>
                        {seg.chunk.text.substring(0, 60)}
                      </Text>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* ======== 分片列表视图 ======== */
            <div style={{ maxHeight: '65vh', overflow: 'auto' }}>
              {segments.map((seg, i) => (
                <div
                  key={seg.chunk.chunkSeq}
                  style={{
                    padding: '12px 16px', marginBottom: 8,
                    background: seg.bg,
                    borderLeft: `4px solid ${seg.border}`,
                    borderRadius: '0 6px 6px 0',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 4 }}>
                    <Space size={4}>
                      <Badge count={seg.chunk.chunkSeq} style={{ backgroundColor: seg.border }} />
                      <Tag>{seg.chunk.charCount} 字符</Tag>
                      {seg.chunk.sectionPath && <Tag color="blue">{seg.chunk.sectionPath}</Tag>}
                    </Space>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      位置 [{seg.chunk.charStart}–{seg.chunk.charEnd}]
                    </Text>
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, lineHeight: 1.9, color: '#333' }}>
                    {seg.chunk.text}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
