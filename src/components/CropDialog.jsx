import { useEffect, useRef, useState } from "react";
import { Modal, Box, Text, Group, Button, Slider } from "@mantine/core";

const FRAME_W = 360;
const FRAME_H = 270; // 4:3
const OUT_W = 800;
const OUT_H = 600;

export default function CropDialog({ file, onCancel, onSave }) {
  const [img, setImg] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setImg(image);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!file || !img) return null;

  const baseScale = Math.max(FRAME_W / img.naturalWidth, FRAME_H / img.naturalHeight);
  const totalScale = baseScale * zoom;
  const dispW = img.naturalWidth * totalScale;
  const dispH = img.naturalHeight * totalScale;
  const left = (FRAME_W - dispW) / 2 + offset.x;
  const top = (FRAME_H - dispH) / 2 + offset.y;

  function handleMouseDown(e) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, offset };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }
  function handleMouseMove(e) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset({ x: dragRef.current.offset.x + dx, y: dragRef.current.offset.y + dy });
  }
  function handleMouseUp() {
    dragRef.current = null;
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  }

  function handleSave() {
    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext("2d");
    const scaleRatio = OUT_W / FRAME_W;
    ctx.drawImage(
      img,
      0,
      0,
      img.naturalWidth,
      img.naturalHeight,
      left * scaleRatio,
      top * scaleRatio,
      dispW * scaleRatio,
      dispH * scaleRatio,
    );
    canvas.toBlob(
      (blob) => {
        if (blob) onSave(URL.createObjectURL(blob));
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <Modal opened onClose={onCancel} title={<Text fw={700} size="sm">Crop Photo (4:3)</Text>} size="auto" centered>
      <Box
        onMouseDown={handleMouseDown}
        style={{
          width: FRAME_W,
          height: FRAME_H,
          overflow: "hidden",
          position: "relative",
          background: "#111",
          borderRadius: 6,
          cursor: "grab",
          userSelect: "none",
        }}
      >
        <img
          src={img.src}
          draggable={false}
          style={{ position: "absolute", left, top, width: dispW, height: dispH, maxWidth: "none" }}
          alt="Crop preview"
        />
      </Box>

      <Text size="10px" c="dimmed" mt={8} mb={4}>
        Drag to reposition · zoom to resize
      </Text>
      <Slider min={1} max={2.5} step={0.05} value={zoom} onChange={setZoom} mb={16} />

      <Group justify="flex-end">
        <Button variant="default" size="xs" onClick={onCancel}>Cancel</Button>
        <Button size="xs" onClick={handleSave} style={{ background: "#0F2744", border: "none" }}>Save crop</Button>
      </Group>
    </Modal>
  );
}
