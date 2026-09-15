import { useRef, useEffect } from "react";
import { collectLeafKeys, type RegionNode } from "../utils/addressParser";

interface Props {
  nodes: RegionNode[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  depth?: number;
}

function TriStateCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} />;
}

export default function RegionFilterTree({ nodes, selected, onChange, depth = 0 }: Props) {
  return (
    <ul className={`region-tree depth-${depth}`}>
      {nodes.map((node) => {
        const leafKeys = collectLeafKeys(node);
        const checked = leafKeys.every((k) => selected.has(k));
        const indeterminate = !checked && leafKeys.some((k) => selected.has(k));

        const toggle = () => {
          const next = new Set(selected);
          if (checked) {
            for (const k of leafKeys) next.delete(k);
          } else {
            for (const k of leafKeys) next.add(k);
          }
          onChange(next);
        };

        return (
          <li key={node.key}>
            <label>
              <TriStateCheckbox checked={checked} indeterminate={indeterminate} onChange={toggle} />
              <span>
                {node.label} <em>({node.count})</em>
              </span>
            </label>
            {node.children.length > 0 && (
              <RegionFilterTree nodes={node.children} selected={selected} onChange={onChange} depth={depth + 1} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
