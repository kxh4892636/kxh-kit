interface AutoPlaySwitchProps {
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}

/**
 * Native switch role, 44px hit area. The visible label is the accessible name;
 * state is exposed through aria-checked so assistive tech announces on/off.
 */
export const AutoPlaySwitch: React.FC<AutoPlaySwitchProps> = (props) => {
  const { checked, disabled, onChange } = props;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__track" aria-hidden="true">
        <span className="switch__thumb" />
      </span>
      <span className="switch__label">自动播放</span>
    </button>
  );
};
