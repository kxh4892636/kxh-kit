// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ConfirmModal } from "./confirm-modal.js";

afterEach(() => {
  cleanup();
});

const baseProps = {
  open: true,
  title: "撤回这一轮会话？",
  message: "会话会回到上一轮结束的状态，本轮的用户输入回到输入框，原会话被删除。",
  preview: "commit",
  confirmLabel: "撤回",
  cancelLabel: "取消",
};

describe("ConfirmModal", () => {
  it("uses the host confirm-dialog layout: description slot, preview body, native action widths", () => {
    const { container } = render(
      createElement(ConfirmModal, { ...baseProps, onConfirm: vi.fn(), onCancel: vi.fn() }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(baseProps.message)).toBeDefined();
    const preview = container.querySelector("pre.dshtk-dialog-preview");
    expect(preview?.textContent).toBe("commit");
    const cancel = within(dialog).getByText("取消");
    const confirm = within(dialog).getByText("撤回");
    expect(cancel.className).toBe("dshtk-modal-action");
    expect(confirm.className).toBe("dshtk-confirm-action");
  });

  it("wires the two actions", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(createElement(ConfirmModal, { ...baseProps, onConfirm, onCancel }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByText("取消"));
    fireEvent.click(within(dialog).getByText("撤回"));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("renders the error line and stays closed while open is false", () => {
    render(
      createElement(ConfirmModal, {
        ...baseProps,
        error: "撤回失败：会话未打开",
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      }),
    );
    expect(screen.getByText("撤回失败：会话未打开")).toBeDefined();
    cleanup();
    render(
      createElement(ConfirmModal, {
        ...baseProps,
        open: false,
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
