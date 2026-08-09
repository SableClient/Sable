export const readFileToString = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () =>
      resolve(typeof reader.result === 'string' ? reader.result : '')
    );
    reader.addEventListener('error', () => reject(new Error(`Could not read ${file.name}.`)));

    reader.readAsText(file);
  });
};
