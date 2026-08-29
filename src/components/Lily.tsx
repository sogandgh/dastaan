import { forwardRef } from 'react';
import './Lily.css';

type LilyProps = {
  onTap: () => void;
};

export const Lily = forwardRef<HTMLDivElement, LilyProps>(function Lily({ onTap }, stageRef) {
  return (
    <div className="lily-holder" onClick={onTap} role="button" tabIndex={0} aria-label="Say hi to Lily">
      <div className="lily-stage" ref={stageRef} aria-hidden="true">
        <div className="lily" id="lily">
          <div className="hair-side-l" />
          <div className="hair-side-r" />
          <div className="curl-end-l" />
          <div className="curl-end-r" />
          <div className="head" />
          <div className="hair-cap" />
          <div className="curl curl1" />
          <div className="curl curl2" />
          <div className="curl curl3" />
          <div className="curl curl4" />
          <div className="curl curl5" />
          <div className="curl curl6" />
          <div className="eyes">
            <div className="eye1"><div className="pupil" /><div className="pupil-shine" /><div className="lid" /></div>
            <div className="eye2"><div className="pupil" /><div className="pupil-shine" /><div className="lid" /></div>
          </div>
          <div className="brow-l" />
          <div className="brow-r" />
          <div className="cheek-l" />
          <div className="cheek-r" />
          <div className="nose" />
          <div className="mouth1" />
          <div className="mouth2" />
          <div className="neck" />
          <div className="dress" />
          <div className="dress-trim" />
          <div className="collar" />
          <div className="arm-l-group">
            <div className="sleeve" />
            <div className="arm" />
            <div className="hand" />
          </div>
          <div className="arm-r-group">
            <div className="sleeve" />
            <div className="arm" />
            <div className="hand" />
          </div>
          <div className="leg-l" />
          <div className="leg-r" />
          <div className="shoe-l" />
          <div className="shoe-r" />
        </div>
      </div>
    </div>
  );
});
