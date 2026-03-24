import React, { ReactNode } from "react";

interface ButtonProps {
  children: ReactNode;
  clickHandler: () => void;
  disabled?: boolean;
}

/**
 *
 * @param props clickHandler: function to be called when the button is clicked
 * @param props disabled: boolean to disable the button
 *
 * @returns a custom button configured with the given props
 */

const Button: React.FC<ButtonProps> = (props) => {
  return (
    <div style={{ display: 'inline-block' }}>
      <button
        style={{
          padding: '10px 20px',
          backgroundColor: props.disabled ? '#666' : '#9333EA',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          cursor: props.disabled ? 'not-allowed' : 'pointer',
          fontSize: '16px',
          fontWeight: '500',
          transition: 'background-color 0.2s',
          opacity: props.disabled ? 0.5 : 1,
        }}
        onClick={props.clickHandler}
        disabled={props.disabled}
        onMouseEnter={(e) => {
          if (!props.disabled) {
            e.currentTarget.style.backgroundColor = '#7C3AED';
          }
        }}
        onMouseLeave={(e) => {
          if (!props.disabled) {
            e.currentTarget.style.backgroundColor = '#9333EA';
          }
        }}
      >
        {props.children}
      </button>
    </div>
  );
};

export default Button;
