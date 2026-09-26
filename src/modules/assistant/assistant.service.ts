import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { decryptSecret, encryptSecret, maskSecret } from '../../common/crypto/secret-cipher';
import { assistantConfig, type AssistantConfig } from '../../config/app.config';
import { ASSISTANT_PROVIDERS, findAssistantProvider } from '../../domain/assistant-providers';
import { AssistantProviderEntity } from './assistant-provider.entity';
import type {
  AssistantProviderDto,
  AssistantSettingsDto,
  AssistantSettingsInputDto,
} from './dto/assistant.dto';
import { ModelClientService, type Credentials } from './model-client.service';

@Injectable()
export class AssistantService {
  constructor(
    @Inject(assistantConfig.KEY) private readonly config: AssistantConfig,
    @InjectRepository(AssistantProviderEntity)
    private readonly providers: Repository<AssistantProviderEntity>,
    private readonly client: ModelClientService,
  ) {}

  catalog(): AssistantProviderDto[] {
    return ASSISTANT_PROVIDERS.map(({ api: _api, baseUrl: _baseUrl, ...provider }) => provider);
  }

  async settings(userId: string): Promise<AssistantSettingsDto> {
    const saved = await this.providers.findOne({ where: { userId } });

    return {
      provider: saved?.provider ?? null,
      model: saved?.model ?? null,
      keyHint: saved?.keyHint ?? null,
      available: this.config.encryptionKey !== null,
    };
  }

  async save(userId: string, input: AssistantSettingsInputDto): Promise<AssistantSettingsDto> {
    const key = this.requireKey();
    const existing = await this.providers.findOne({ where: { userId } });
    const apiKey = input.apiKey?.trim();

    if (!apiKey && (!existing || existing.provider !== input.provider)) {
      throw new BadRequestException('Укажи ключ API для этого провайдера');
    }

    const secret = apiKey ? encryptSecret(apiKey, key) : null;

    await this.providers.save({
      userId,
      provider: input.provider,
      model: input.model.trim(),
      keyCipher: secret?.cipher ?? existing!.keyCipher,
      keyIv: secret?.iv ?? existing!.keyIv,
      keyTag: secret?.tag ?? existing!.keyTag,
      keyHint: apiKey ? maskSecret(apiKey) : existing!.keyHint,
    });

    return this.settings(userId);
  }

  async remove(userId: string): Promise<void> {
    await this.providers.delete({ userId });
  }

  async models(userId: string, providerId: string): Promise<string[]> {
    const provider = findAssistantProvider(providerId);

    if (!provider) throw new BadRequestException('Unknown provider');

    const saved = await this.providers.findOne({ where: { userId } });

    if (!saved || saved.provider !== providerId || !this.config.encryptionKey) {
      return provider.models;
    }

    return this.client.models(provider, this.decrypt(saved));
  }

  async credentials(userId: string): Promise<Credentials> {
    const saved = await this.providers.findOne({ where: { userId } });
    const provider = saved ? findAssistantProvider(saved.provider) : undefined;

    if (!saved || !provider) {
      throw new BadRequestException('Подключи ассистента в настройках');
    }

    return { provider, model: saved.model, apiKey: this.decrypt(saved) };
  }

  private decrypt(saved: AssistantProviderEntity): string {
    return decryptSecret(
      { cipher: saved.keyCipher, iv: saved.keyIv, tag: saved.keyTag },
      this.requireKey(),
    );
  }

  private requireKey(): Buffer {
    if (!this.config.encryptionKey) {
      throw new ServiceUnavailableException('На сервере не задан ENCRYPTION_KEY');
    }

    return this.config.encryptionKey;
  }
}
