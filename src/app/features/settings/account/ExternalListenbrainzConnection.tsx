import { SettingTile } from '$components/setting-tile';
import { ExternalListenbrainzConnection } from '$hooks/useUserProfile';
import { Input } from 'folds';
import { useState, useEffect, ChangeEvent } from 'react';

export type ExternalListenbrainzConnectionProps = {
  current?: ExternalListenbrainzConnection;
  onSave: (p: ExternalListenbrainzConnection) => void;
};

export function ExternalListenbrainzConnectionEditor({
  current,
  onSave,
}: ExternalListenbrainzConnectionProps) {
  const initialString = current?.username ? `@${current.username}` : '';
  const [val, setVal] = useState(initialString);

  useEffect(() => setVal(initialString), [initialString]);

  const handleSave = () => {
    if (val === initialString) return;
    onSave({ username: val.replace('@', ''), v: 1 });
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setVal(e.currentTarget.value);
  };

  return (
    <SettingTile
      title="Listenbrainz Account"
      // let people link their Listenbrainz account by entering their Listenbrainz username (e.g. "@myusername")
      description="Enter your Listenbrainz username (e.g. '@myusername') to link your account."
      after={
        <Input
          value={val}
          size="300"
          radii="300"
          variant="Secondary"
          placeholder="Listenbrainz username..."
          onChange={handleChange}
          onBlur={handleSave}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          style={{ width: '232px' }}
        />
      }
    />
  );
}
