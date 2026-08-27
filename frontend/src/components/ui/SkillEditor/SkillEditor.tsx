import React, { useState } from 'react';
import styles from './SkillEditor.module.css';
import { SkillDocument } from '@/types/api';
import { Button } from '../Button/Button';
import { Input } from '../Input/Input';

interface SkillEditorProps {
  initialDocument: SkillDocument | null;
  onSave: (doc: SkillDocument) => Promise<void>;
  isSaving: boolean;
}

const DEFAULT_DOCUMENT: SkillDocument = {
  name: '',
  title: '',
  description: '',
  goal: '',
  principles: [],
  modules: [],
  connectors: [],
  commands: [],
  humanGuide: { summary: '', sections: [] }
};

export const SkillEditor: React.FC<SkillEditorProps> = ({ initialDocument, onSave, isSaving }) => {
  const [doc, setDoc] = useState<SkillDocument>(initialDocument || DEFAULT_DOCUMENT);

  const updateDoc = (fields: Partial<SkillDocument>) => {
    setDoc(prev => ({ ...prev, ...fields }));
  };

  const handleSave = () => {
    onSave(doc);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Skill Settings</h2>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      <div className={styles.warningAlert}>
        <strong>⚠️ Visual Editor Warning:</strong> Saving changes here will re-render your <code>SKILL.md</code> and <code>HUMAN.md</code> files. Any manual code edits you made to those files will be overwritten by this structure.
      </div>

      <div className={styles.section}>
        <h3>Identity</h3>
        <div className={styles.fieldGroup}>
          <label>Name (kebab-case)</label>
          <Input 
            value={doc.name} 
            onChange={e => updateDoc({ name: e.target.value })} 
            placeholder="e.g., github-reviewer"
          />
        </div>
        <div className={styles.fieldGroup}>
          <label>Title</label>
          <Input 
            value={doc.title} 
            onChange={e => updateDoc({ title: e.target.value })} 
            placeholder="e.g., GitHub Code Reviewer"
          />
        </div>
        <div className={styles.fieldGroup}>
          <label>Description</label>
          <Input 
            value={doc.description} 
            onChange={e => updateDoc({ description: e.target.value })} 
            placeholder="Short description of the skill..."
          />
        </div>
        <div className={styles.fieldGroup}>
          <label>Goal</label>
          <textarea 
            className={styles.textarea}
            value={doc.goal} 
            onChange={e => updateDoc({ goal: e.target.value })} 
            placeholder="What should the agent achieve?"
            rows={3}
          />
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3>Principles</h3>
          <Button 
            variant="secondary"
            onClick={() => updateDoc({ principles: [...doc.principles, { title: 'New Principle', rule: '' }] })}
          >
            + Add Principle
          </Button>
        </div>
        <div className={styles.list}>
          {doc.principles.map((p, idx) => (
            <div key={idx} className={styles.card}>
              <Input 
                value={p.title}
                onChange={e => {
                  const newP = [...doc.principles];
                  newP[idx].title = e.target.value;
                  updateDoc({ principles: newP });
                }}
                className={styles.cardInput}
                placeholder="Principle title"
              />
              <textarea
                className={styles.textarea}
                value={p.rule}
                onChange={e => {
                  const newP = [...doc.principles];
                  newP[idx].rule = e.target.value;
                  updateDoc({ principles: newP });
                }}
                rows={2}
                placeholder="Rule definition..."
              />
              <button 
                className={styles.removeBtn}
                onClick={() => {
                  const newP = [...doc.principles];
                  newP.splice(idx, 1);
                  updateDoc({ principles: newP });
                }}
              >
                ✕
              </button>
            </div>
          ))}
          {doc.principles.length === 0 && <p className={styles.empty}>No principles defined.</p>}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3>Commands</h3>
          <Button 
            variant="secondary"
            onClick={() => updateDoc({ commands: [...doc.commands, { name: 'new_command', description: '', steps: [''] }] })}
          >
            + Add Command
          </Button>
        </div>
        <div className={styles.list}>
          {doc.commands.map((cmd, idx) => (
            <div key={idx} className={styles.card}>
              <div className={styles.commandHeader}>
                <Input 
                  value={cmd.name}
                  onChange={e => {
                    const newC = [...doc.commands];
                    newC[idx].name = e.target.value;
                    updateDoc({ commands: newC });
                  }}
                  className={styles.cmdNameInput}
                  placeholder="Command name"
                />
                <button 
                  className={styles.removeBtn}
                  onClick={() => {
                    const newC = [...doc.commands];
                    newC.splice(idx, 1);
                    updateDoc({ commands: newC });
                  }}
                >
                  ✕
                </button>
              </div>
              <Input 
                value={cmd.description}
                onChange={e => {
                  const newC = [...doc.commands];
                  newC[idx].description = e.target.value;
                  updateDoc({ commands: newC });
                }}
                placeholder="Command description..."
                className={styles.cardInput}
              />
              <div className={styles.steps}>
                <strong>Steps:</strong>
                {cmd.steps.map((step, stepIdx) => (
                  <div key={stepIdx} className={styles.stepRow}>
                    <span>{stepIdx + 1}.</span>
                    <Input 
                      value={step}
                      onChange={e => {
                        const newC = [...doc.commands];
                        newC[idx].steps[stepIdx] = e.target.value;
                        updateDoc({ commands: newC });
                      }}
                      className={styles.stepInput}
                    />
                    <button 
                      className={styles.removeStepBtn}
                      onClick={() => {
                        const newC = [...doc.commands];
                        newC[idx].steps.splice(stepIdx, 1);
                        updateDoc({ commands: newC });
                      }}
                    >
                      -
                    </button>
                  </div>
                ))}
                <button 
                  className={styles.addStepBtn}
                  onClick={() => {
                    const newC = [...doc.commands];
                    newC[idx].steps.push('');
                    updateDoc({ commands: newC });
                  }}
                >
                  + Add Step
                </button>
              </div>
            </div>
          ))}
          {doc.commands.length === 0 && <p className={styles.empty}>No commands defined.</p>}
        </div>
      </div>

    </div>
  );
};
